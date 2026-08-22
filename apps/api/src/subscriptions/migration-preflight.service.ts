import { Injectable, Logger } from '@nestjs/common';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as crypto from 'node:crypto';
import { AuditService } from '../common/audit/audit.service';
import { MigrationActions } from '../common/audit/audit.actions';
import { resolvePublicHost } from './migration-net.util';
import type { CreateMigrationBundleDto } from './dto/migration.dto';

/**
 * Preflight migratora — weryfikacja dostępów PRZED zakolejkowaniem zlecenia.
 *
 * Cel: klient dostaje natychmiastową informację „te dane działają / te nie”,
 * zamiast dowiadywać się o literówce w haśle po godzinie z maila o błędzie.
 * Bez zewnętrznych zależności (npm registry-free): FTP/FTPS i IMAP to pełny
 * test logowania, MySQL to handshake z auth `mysql_native_password` /
 * `caching_sha2` fast-path, SFTP/SSH to test banera (pełna weryfikacja hasła
 * następuje na compute-node przy transferze — API nie implementuje SSH).
 *
 * Statusy:
 *  - ok           — zalogowano poprawnie
 *  - reachable    — usługa odpowiada, ale pełna weryfikacja hasła nastąpi przy transferze
 *  - auth_failed  — usługa odrzuciła login/hasło
 *  - unreachable  — brak połączenia (firewall, zły host/port)
 */

export type PreflightStatus = 'ok' | 'reachable' | 'auth_failed' | 'unreachable';

export interface PreflightCheckResult {
  kind: 'ftp' | 'sftp' | 'mysql' | 'imap';
  target: string;
  status: PreflightStatus;
  message: string;
  latencyMs: number | null;
}

export interface PreflightSummary {
  ok: boolean;
  checks: PreflightCheckResult[];
  checkedAt: string;
}

const TIMEOUT_MS = 12_000;

@Injectable()
export class MigrationPreflightService {
  private readonly logger = new Logger(MigrationPreflightService.name);

  constructor(private readonly audit: AuditService) {}

  async preflightBundle(
    dto: CreateMigrationBundleDto,
    userId: string,
    subscriptionId: string,
  ): Promise<PreflightSummary> {
    const checks: Array<Promise<PreflightCheckResult>> = [];

    if (dto.ftp) {
      const ftp = dto.ftp;
      const protocol = ftp.protocol ?? 'sftp';
      checks.push(
        protocol === 'sftp'
          ? this.checkSsh(ftp.host, ftp.port)
          : this.checkFtp(ftp.host, ftp.port, ftp.username, ftp.password, protocol === 'ftps'),
      );
    }
    for (const db of dto.mysql ?? []) {
      checks.push(this.checkMysql(db.host, db.port, db.username, db.password, db.database));
    }
    for (const box of dto.imap ?? []) {
      checks.push(this.checkImap(box.host, box.port, box.username, box.password));
    }

    const results = await Promise.all(checks);
    const ok = results.every((r) => r.status === 'ok' || r.status === 'reachable');

    await this.audit.record({
      action: MigrationActions.MIGRATION_PREFLIGHT_RUN,
      userId,
      actorUserId: userId,
      details: {
        subscriptionId,
        ok,
        results: results.map((r) => ({ kind: r.kind, target: r.target, status: r.status })),
      },
    });

    return { ok, checks: results, checkedAt: new Date().toISOString() };
  }

  // --- SSH/SFTP: test banera ---------------------------------------------------

  private async checkSsh(host: string, port: number): Promise<PreflightCheckResult> {
    const target = `sftp://${host}:${port}`;
    const started = Date.now();
    try {
      const ip = await resolvePublicHost(host);
      const banner = await new Promise<string>((resolve, reject) => {
        const socket = net.connect({ host: ip, port, timeout: TIMEOUT_MS });
        let buf = '';
        socket.on('timeout', () => socket.destroy(new Error('timeout')));
        socket.on('error', reject);
        socket.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          if (buf.includes('\n') || buf.length > 255) {
            socket.destroy();
            resolve(buf.trim());
          }
        });
        socket.on('close', () => resolve(buf.trim()));
      });
      if (banner.startsWith('SSH-')) {
        return {
          kind: 'sftp',
          target,
          status: 'reachable',
          message: `Serwer SSH odpowiada (${banner.split('\r')[0].slice(0, 64)}). Hasło zweryfikujemy przy transferze.`,
          latencyMs: Date.now() - started,
        };
      }
      return {
        kind: 'sftp',
        target,
        status: 'unreachable',
        message: 'Port odpowiada, ale nie wygląda na serwer SSH/SFTP.',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return this.unreachable('sftp', target, started, err);
    }
  }

  // --- FTP / FTPS (explicit AUTH TLS) -------------------------------------------

  private async checkFtp(
    host: string,
    port: number,
    username: string,
    password: string,
    preferTls: boolean,
  ): Promise<PreflightCheckResult> {
    const target = `${preferTls ? 'ftps' : 'ftp'}://${host}:${port}`;
    const started = Date.now();
    try {
      const ip = await resolvePublicHost(host);
      assertNoControlChars(username, password);
      const status = await ftpLogin(ip, host, port, username, password, preferTls);
      return {
        kind: 'ftp',
        target,
        status,
        message:
          status === 'ok'
            ? 'Zalogowano do FTP poprawnie.'
            : status === 'auth_failed'
              ? 'Serwer FTP odrzucił login lub hasło.'
              : 'Serwer FTP odpowiada, ale nie udało się dokończyć logowania — zweryfikujemy przy transferze.',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return this.unreachable('ftp', target, started, err);
    }
  }

  // --- IMAP ----------------------------------------------------------------------

  private async checkImap(
    host: string,
    port: number,
    username: string,
    password: string,
  ): Promise<PreflightCheckResult> {
    const target = `imap://${host}:${port}`;
    const started = Date.now();
    try {
      const ip = await resolvePublicHost(host);
      assertNoControlChars(username, password);
      const status = await imapLogin(ip, host, port, username, password);
      return {
        kind: 'imap',
        target: `${target} (${username})`,
        status,
        message:
          status === 'ok'
            ? 'Zalogowano do skrzynki IMAP poprawnie.'
            : status === 'auth_failed'
              ? 'Serwer IMAP odrzucił login lub hasło skrzynki.'
              : 'Serwer IMAP odpowiada, ale nie udało się dokończyć logowania.',
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return this.unreachable('imap', `${target} (${username})`, started, err);
    }
  }

  // --- MySQL -----------------------------------------------------------------------

  private async checkMysql(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
  ): Promise<PreflightCheckResult> {
    const target = `mysql://${host}:${port}/${database}`;
    const started = Date.now();
    try {
      const ip = await resolvePublicHost(host);
      const result = await mysqlLogin(ip, port, username, password, database);
      return { kind: 'mysql', target, ...result, latencyMs: Date.now() - started };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.message === 'timeout') {
        return {
          kind: 'mysql',
          target,
          status: 'unreachable',
          message:
            'Zdalny MySQL nie odpowiada — większość hostingów blokuje zdalne połączenia do baz. ' +
            'Spróbujemy przez SSH przy transferze, a w razie potrzeby dokończy to nasz zespół.',
          latencyMs: Date.now() - started,
        };
      }
      return this.unreachable('mysql', target, started, err);
    }
  }

  private unreachable(
    kind: PreflightCheckResult['kind'],
    target: string,
    started: number,
    err: unknown,
  ): PreflightCheckResult {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.debug(`preflight ${kind} ${target}: ${message}`);
    return {
      kind,
      target,
      status: 'unreachable',
      message: `Brak połączenia: ${message}`,
      latencyMs: Date.now() - started,
    };
  }
}

function assertNoControlChars(...values: string[]): void {
  for (const v of values) {
     
    if (/[\x00-\x1f\x7f]/.test(v)) throw new Error('Dane logowania zawierają znaki sterujące.');
  }
}

// =============================================================================
// FTP — konwersacja na kanale sterującym (z opcjonalnym AUTH TLS).
// =============================================================================

function ftpLogin(
  connectHost: string,
  host: string,
  port: number,
  username: string,
  password: string,
  preferTls: boolean,
): Promise<PreflightStatus> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket = net.connect({ host: connectHost, port, timeout: TIMEOUT_MS });
    let buffer = '';
    let stage: 'greeting' | 'auth-tls' | 'user' | 'pass' = 'greeting';
    let settled = false;

    const finish = (value: PreflightStatus) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const send = (line: string) => socket.write(`${line}\r\n`);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // Odpowiedź FTP kończy się linią "NNN tekst" (multiline: "NNN-").
      const lines = buffer.split(/\r?\n/);
      const finalLine = lines.find((l) => /^\d{3} /.test(l));
      if (!finalLine) return;
      buffer = '';
      const code = Number.parseInt(finalLine.slice(0, 3), 10);

      if (stage === 'greeting') {
        if (code !== 220) return fail(new Error(`FTP: nieoczekiwane powitanie (${code})`));
        if (preferTls) {
          stage = 'auth-tls';
          send('AUTH TLS');
        } else {
          stage = 'user';
          send(`USER ${username}`);
        }
        return;
      }
      if (stage === 'auth-tls') {
        if (code === 234) {
          const plain = socket;
          plain.removeAllListeners('data');
          socket = tls.connect({ socket: plain, rejectUnauthorized: false, servername: host });
          socket.on('secureConnect', () => {
            stage = 'user';
            send(`USER ${username}`);
          });
          socket.on('data', onData);
          socket.on('error', fail);
          return;
        }
        // Serwer nie wspiera AUTH TLS — próbujemy plaintext.
        stage = 'user';
        send(`USER ${username}`);
        return;
      }
      if (stage === 'user') {
        if (code === 331 || code === 230) {
          if (code === 230) return finish('ok');
          stage = 'pass';
          send(`PASS ${password}`);
          return;
        }
        if (code === 530) return finish('auth_failed');
        return finish('reachable');
      }
      if (stage === 'pass') {
        if (code === 230) return finish('ok');
        if (code === 530) return finish('auth_failed');
        return finish('reachable');
      }
    };

    socket.on('timeout', () => fail(new Error('timeout')));
    socket.on('error', fail);
    socket.on('data', onData);
  });
}

// =============================================================================
// IMAP — implicit TLS (993) albo STARTTLS (143), potem LOGIN.
// =============================================================================

function imapLogin(
  connectHost: string,
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<PreflightStatus> {
  const implicitTls = port === 993;
  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket = implicitTls
      ? tls.connect({ host: connectHost, port, rejectUnauthorized: false, servername: host, timeout: TIMEOUT_MS })
      : net.connect({ host: connectHost, port, timeout: TIMEOUT_MS });
    let buffer = '';
    let stage: 'greeting' | 'starttls' | 'login' = 'greeting';
    let settled = false;

    const finish = (value: PreflightStatus) => {
      if (settled) return;
      settled = true;
      try {
        socket.write('a3 LOGOUT\r\n');
      } catch {
        /* noop */
      }
      socket.destroy();
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const sendLogin = () => {
      stage = 'login';
      socket.write(`a2 LOGIN ${quote(username)} ${quote(password)}\r\n`);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('\n')) return;
      const text = buffer;
      buffer = '';

      if (stage === 'greeting') {
        if (!text.includes('* OK')) return fail(new Error('IMAP: brak powitania OK'));
        if (implicitTls) return sendLogin();
        stage = 'starttls';
        socket.write('a1 STARTTLS\r\n');
        return;
      }
      if (stage === 'starttls') {
        if (/a1 OK/i.test(text)) {
          const plain = socket;
          plain.removeAllListeners('data');
          socket = tls.connect({ socket: plain, rejectUnauthorized: false, servername: host });
          socket.on('secureConnect', sendLogin);
          socket.on('data', onData);
          socket.on('error', fail);
          return;
        }
        // Brak STARTTLS — logowanie plaintext (ostatnia deska ratunku).
        sendLogin();
        return;
      }
      if (stage === 'login') {
        if (/a2 OK/i.test(text)) return finish('ok');
        if (/a2 (NO|BAD)/i.test(text)) return finish('auth_failed');
      }
    };

    socket.on('timeout', () => fail(new Error('timeout')));
    socket.on('error', fail);
    socket.on('data', onData);
  });
}

// =============================================================================
// MySQL — handshake v10 + mysql_native_password / caching_sha2 fast-path.
// =============================================================================

function mysqlLogin(
  host: string,
  port: number,
  username: string,
  password: string,
  database: string,
): Promise<{ status: PreflightStatus; message: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: TIMEOUT_MS });
    let settled = false;
    let received: Buffer = Buffer.alloc(0);
    let stage: 'greeting' | 'auth' = 'greeting';

    const finish = (status: PreflightStatus, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ status, message });
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.on('timeout', () => fail(new Error('timeout')));
    socket.on('error', fail);
    socket.on('data', (chunk: Buffer | string) => {
      // Patrz probe-runner.service.ts — @types/node 26 rozszerzyło sygnaturę.
      received = Buffer.concat([received, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      const packet = readMysqlPacket(received);
      if (!packet) return;
      received = packet.rest;

      if (stage === 'greeting') {
        try {
          const greeting = parseMysqlGreeting(packet.payload);
          const authResponse = mysqlAuthToken(greeting.authPlugin, password, greeting.scramble);
          if (!authResponse) {
            return finish(
              'reachable',
              `Serwer MySQL używa uwierzytelniania ${greeting.authPlugin} — pełna weryfikacja przy transferze.`,
            );
          }
          socket.write(
            buildMysqlHandshakeResponse(username, authResponse, database, greeting.authPlugin, packet.sequence + 1),
          );
          stage = 'auth';
        } catch (err) {
          fail(err as Error);
        }
        return;
      }

      // stage === 'auth'
      const head = packet.payload[0];
      if (head === 0x00) return finish('ok', 'Połączono z bazą MySQL poprawnie.');
      if (head === 0xff) {
        const code = packet.payload.readUInt16LE(1);
        const msg = packet.payload.subarray(9).toString('utf8').slice(0, 160);
        if (code === 1045) return finish('auth_failed', 'MySQL odrzucił login lub hasło (1045).');
        if (code === 1044 || code === 1049) {
          return finish('auth_failed', `MySQL: brak dostępu do bazy ${database} (${code}): ${msg}`);
        }
        if (code === 1130) {
          return finish(
            'unreachable',
            'MySQL nie pozwala na zdalne połączenia z naszego adresu (1130) — spróbujemy przez SSH przy transferze.',
          );
        }
        return finish('reachable', `MySQL odpowiedział błędem ${code}: ${msg}`);
      }
      if (head === 0x01) {
        // caching_sha2: 0x03 = fast-auth OK (zaraz przyjdzie OK), 0x04 = pełna ścieżka (TLS/RSA).
        const flag = packet.payload[1];
        if (flag === 0x03) return; // czekamy na pakiet OK
        return finish(
          'reachable',
          'MySQL wymaga pełnego uwierzytelnienia caching_sha2 (TLS) — pełna weryfikacja przy transferze.',
        );
      }
      if (head === 0xfe) {
        return finish(
          'reachable',
          'MySQL poprosił o zmianę wtyczki uwierzytelniania — pełna weryfikacja przy transferze.',
        );
      }
      return finish('reachable', 'Nieoczekiwana odpowiedź MySQL — pełna weryfikacja przy transferze.');
    });
  });
}

function readMysqlPacket(buf: Buffer): { payload: Buffer; sequence: number; rest: Buffer } | null {
  if (buf.length < 4) return null;
  const length = buf.readUIntLE(0, 3);
  if (buf.length < 4 + length) return null;
  return {
    payload: buf.subarray(4, 4 + length),
    sequence: buf[3],
    rest: buf.subarray(4 + length),
  };
}

function parseMysqlGreeting(payload: Buffer): { scramble: Buffer; authPlugin: string } {
  if (payload[0] === 0xff) {
    const code = payload.readUInt16LE(1);
    throw new Error(`MySQL odrzucił połączenie (błąd ${code}) — prawdopodobnie blokada zdalnych hostów.`);
  }
  if (payload[0] !== 10) throw new Error(`MySQL: nieobsługiwana wersja protokołu (${payload[0]})`);
  let off = 1;
  const versionEnd = payload.indexOf(0, off);
  off = versionEnd + 1; // server version
  off += 4; // thread id
  const scramble1 = payload.subarray(off, off + 8);
  off += 8 + 1; // + filler
  off += 2; // capabilities low
  off += 1; // charset
  off += 2; // status
  const capsHigh = off; // capabilities high (2b)
  off += 2;
  const authDataLen = payload[off];
  off += 1;
  off += 10; // reserved
  const scramble2Len = Math.max(13, authDataLen - 8) - 1; // bez trailing NUL
  const scramble2 = payload.subarray(off, off + scramble2Len);
  off += scramble2Len + 1;
  let authPlugin = 'mysql_native_password';
  const pluginEnd = payload.indexOf(0, off);
  if (pluginEnd > off) authPlugin = payload.subarray(off, pluginEnd).toString('utf8');
  void capsHigh;
  return { scramble: Buffer.concat([scramble1, scramble2]).subarray(0, 20), authPlugin };
}

function mysqlAuthToken(plugin: string, password: string, scramble: Buffer): Buffer | null {
  if (password.length === 0) return Buffer.alloc(0);
  if (plugin === 'mysql_native_password') {
    const sha1 = (data: Buffer) => crypto.createHash('sha1').update(data).digest();
    const passHash = sha1(Buffer.from(password, 'utf8'));
    const inner = sha1(Buffer.concat([scramble, sha1(passHash)]));
    return xorBuffers(passHash, inner);
  }
  if (plugin === 'caching_sha2_password') {
    const sha256 = (data: Buffer) => crypto.createHash('sha256').update(data).digest();
    const passHash = sha256(Buffer.from(password, 'utf8'));
    const inner = sha256(Buffer.concat([sha256(passHash), scramble]));
    return xorBuffers(passHash, inner);
  }
  return null;
}

function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i % b.length];
  return out;
}

function buildMysqlHandshakeResponse(
  username: string,
  authToken: Buffer,
  database: string,
  plugin: string,
  sequence: number,
): Buffer {
  const CLIENT_PROTOCOL_41 = 0x00000200;
  const CLIENT_SECURE_CONNECTION = 0x00008000;
  const CLIENT_PLUGIN_AUTH = 0x00080000;
  const CLIENT_CONNECT_WITH_DB = 0x00000008;
  let caps = CLIENT_PROTOCOL_41 | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH;
  if (database) caps |= CLIENT_CONNECT_WITH_DB;

  const head = Buffer.alloc(4 + 4 + 1 + 23);
  head.writeUInt32LE(caps >>> 0, 0);
  head.writeUInt32LE(16 * 1024 * 1024, 4);
  head.writeUInt8(33, 8); // utf8_general_ci

  const parts: Buffer[] = [
    head,
    Buffer.from(`${username}\0`, 'utf8'),
    Buffer.from([authToken.length]),
    authToken,
  ];
  if (database) parts.push(Buffer.from(`${database}\0`, 'utf8'));
  parts.push(Buffer.from(`${plugin}\0`, 'utf8'));

  const payload = Buffer.concat(parts);
  const packet = Buffer.alloc(4 + payload.length);
  packet.writeUIntLE(payload.length, 0, 3);
  packet.writeUInt8(sequence, 3);
  payload.copy(packet, 4);
  return packet;
}

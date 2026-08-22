import { Injectable, Logger } from '@nestjs/common';
import { ProbeKind } from '@verris/database';
import { connect, type Socket } from 'net';
import { lookup as dnsLookup } from 'dns/promises';

export interface ProbeRunResult {
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Stateless protocol-aware prober used by both the server-side cron and any
 * future ad-hoc probe endpoints. Each method MUST resolve within
 * `timeoutMs` (default 5 s) — anything else is considered a failure.
 *
 * No external dependencies: HTTP/HTTPS uses global `fetch`, raw TCP probes
 * use `node:net`, and DNS uses `node:dns`.
 */
@Injectable()
export class ProbeRunnerService {
  private readonly logger = new Logger(ProbeRunnerService.name);

  async run(
    kind: ProbeKind,
    target: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ProbeRunResult> {
    switch (kind) {
      case ProbeKind.HTTP:
      case ProbeKind.HTTPS:
        return this.runHttp(target, timeoutMs);
      case ProbeKind.SMTP:
        return this.runTcpBanner(target, ['220 '], timeoutMs);
      case ProbeKind.IMAP:
        return this.runTcpBanner(target, ['* OK'], timeoutMs);
      case ProbeKind.POP3:
        return this.runTcpBanner(target, ['+OK'], timeoutMs);
      case ProbeKind.MYSQL:
        // MySQL handshake — server sends a packet immediately on connect; we
        // don't speak the protocol but byte 5 is the protocol version (0x0a).
        return this.runMysqlHandshake(target, timeoutMs);
      case ProbeKind.SSH:
        return this.runTcpBanner(target, ['SSH-'], timeoutMs);
      case ProbeKind.DA_API:
        return this.runHttp(target, timeoutMs);
      case ProbeKind.DNS:
        return this.runDns(target, timeoutMs);
      default:
        return { ok: false, latencyMs: 0, errorCode: 'unknown_kind' };
    }
  }

  private async runHttp(target: string, timeoutMs: number): Promise<ProbeRunResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'verris-prober/1.0' },
      });
      const latency = Date.now() - start;
      const ok = res.status < 500;
      return ok
        ? { ok: true, latencyMs: latency }
        : { ok: false, latencyMs: latency, errorCode: String(res.status) };
    } catch (err) {
      const latency = Date.now() - start;
      const code =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'timeout'
            : (err as NodeJS.ErrnoException).code ?? err.message.slice(0, 30)
          : 'unknown';
      return { ok: false, latencyMs: latency, errorCode: code };
    } finally {
      clearTimeout(timer);
    }
  }

  private async runTcpBanner(
    target: string,
    expectedPrefixes: string[],
    timeoutMs: number,
  ): Promise<ProbeRunResult> {
    const { host, port } = parseHostPort(target);
    if (!host || !port) {
      return { ok: false, latencyMs: 0, errorCode: 'invalid_target' };
    }
    return new Promise<ProbeRunResult>((resolve) => {
      const start = Date.now();
      let buffer = Buffer.alloc(0);
      let done = false;

      const finalize = (result: ProbeRunResult): void => {
        if (done) return;
        done = true;
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(result);
      };

      const socket: Socket = connect({ host, port }, () => {
        // Wait for server greeting.
      });
      socket.setTimeout(timeoutMs);

      socket.on('data', (chunk: Buffer | string) => {
        // @types/node 26 rozszerzyło sygnaturę zdarzenia 'data' o string.
        // Gniazdo bez setEncoding zawsze daje Buffer, ale typ trzeba zawęzić jawnie.
        buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        const banner = buffer.toString('utf8');
        if (expectedPrefixes.some((p) => banner.includes(p))) {
          finalize({ ok: true, latencyMs: Date.now() - start });
        }
      });
      socket.on('timeout', () => finalize({ ok: false, latencyMs: Date.now() - start, errorCode: 'timeout' }));
      socket.on('error', (err) =>
        finalize({
          ok: false,
          latencyMs: Date.now() - start,
          errorCode: (err as NodeJS.ErrnoException).code ?? err.message.slice(0, 30),
        }),
      );
      socket.on('close', () => {
        if (!done) {
          finalize({ ok: false, latencyMs: Date.now() - start, errorCode: 'closed_no_banner' });
        }
      });
    });
  }

  private async runMysqlHandshake(target: string, timeoutMs: number): Promise<ProbeRunResult> {
    const { host, port } = parseHostPort(target);
    if (!host || !port) {
      return { ok: false, latencyMs: 0, errorCode: 'invalid_target' };
    }
    return new Promise<ProbeRunResult>((resolve) => {
      const start = Date.now();
      let done = false;
      const finalize = (result: ProbeRunResult): void => {
        if (done) return;
        done = true;
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(result);
      };

      const socket: Socket = connect({ host, port });
      socket.setTimeout(timeoutMs);

      socket.on('data', (chunk) => {
        // MySQL server greeting: bytes 0-2 = packet length, byte 3 = sequence,
        // byte 4 = protocol version (0x0a for MySQL 4.1+).
        if (chunk.length >= 5 && chunk[4] === 0x0a) {
          finalize({ ok: true, latencyMs: Date.now() - start });
        } else {
          finalize({
            ok: false,
            latencyMs: Date.now() - start,
            errorCode: 'unexpected_handshake',
          });
        }
      });
      socket.on('timeout', () => finalize({ ok: false, latencyMs: Date.now() - start, errorCode: 'timeout' }));
      socket.on('error', (err) =>
        finalize({
          ok: false,
          latencyMs: Date.now() - start,
          errorCode: (err as NodeJS.ErrnoException).code ?? err.message.slice(0, 30),
        }),
      );
    });
  }

  private async runDns(target: string, timeoutMs: number): Promise<ProbeRunResult> {
    const start = Date.now();
    try {
      const hostname = target.replace(/^https?:\/\//, '').split('/')[0];
      const result = await Promise.race([
        dnsLookup(hostname),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs),
        ),
      ]);
      const latency = Date.now() - start;
      return result.address ? { ok: true, latencyMs: latency } : { ok: false, latencyMs: latency, errorCode: 'no_address' };
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 30) : 'unknown';
      return { ok: false, latencyMs: Date.now() - start, errorCode: code };
    }
  }
}

function parseHostPort(target: string): { host: string | null; port: number | null } {
  const match = target.match(/^([^:/]+):(\d+)$/);
  if (!match) return { host: null, port: null };
  const port = Number.parseInt(match[2], 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return { host: null, port: null };
  }
  return { host: match[1], port };
}

import { Injectable, NotFoundException } from '@nestjs/common';
import * as net from 'node:net';
import * as tls from 'node:tls';
import type {
  AuditCheckStatus,
  AuditRecordField,
  DocAttestation,
  NodeStackReadinessDto,
  NodeStackServiceCheckDto,
} from '@verris/contracts';
import { NodeTaskKind, Server, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from './directadmin.service';
import { NodeTasksService } from './node-tasks.service';

const PROBE_TIMEOUT_MS = 8_000;
const CAGEFS_FRESH_MS = 10 * 60 * 1000;

@Injectable()
export class NodeStackReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
    private readonly nodeTasks: NodeTasksService,
  ) {}

  async getReadiness(serverId: string): Promise<NodeStackReadinessDto> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const probeHost = this.resolveProbeHost(server);
    const checks: NodeStackServiceCheckDto[] = [
      await this.checkMailImap(probeHost),
      await this.checkMailSmtp(probeHost),
      await this.checkFtp(probeHost),
      await this.checkMariaDb(probeHost),
      await this.checkHttps(probeHost),
      await this.checkHttp(probeHost),
      await this.checkDaPanel(server),
      this.checkCagefs(server),
      await this.checkGovernorHint(server),
      await this.checkWebServer(probeHost),
    ];

    const latestTask = await this.prisma.nodeTask.findFirst({
      where: { serverId, kind: NodeTaskKind.HOSTING_PROFILE },
      orderBy: { createdAt: 'desc' },
    });

    const ensureAvailable =
      server.status === ServerStatus.ACTIVE && Boolean(server.identityToken);

    return {
      serverId: server.id,
      serverName: server.name,
      probeHost,
      generatedAt: new Date().toISOString(),
      status: worstStatus(checks.map((c) => c.status)),
      checks,
      hostingProfileTask: latestTask
        ? {
            id: latestTask.id,
            status: latestTask.status,
            createdAt: latestTask.createdAt.toISOString(),
            startedAt: latestTask.startedAt?.toISOString() ?? null,
            completedAt: latestTask.completedAt?.toISOString() ?? null,
            errorMessage: latestTask.errorMessage,
          }
        : null,
      ensureAvailable,
    };
  }

  async ensureStack(serverId: string, actorUserId: string, skipBuild = true) {
    return this.nodeTasks.queueHostingProfile(serverId, actorUserId, { skipBuild });
  }

  async repairDaPackages(serverId: string) {
    return this.da.syncPlanPackagesForServer(serverId);
  }

  private resolveProbeHost(server: Server): string {
    const hostname = server.hostname?.trim();
    if (hostname && hostname.includes('.')) return hostname;
    const daHost = server.daHost?.trim();
    if (daHost && daHost.includes('.')) return daHost;
    return server.ipAddress?.trim() ?? hostname ?? daHost ?? server.id;
  }

  private async checkMailImap(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTls(host, 993);
    return this.serviceCheck({
      id: 'mail-imaps',
      title: 'Poczta (IMAP)',
      required: true,
      ok: probe.ok,
      summary: probe.ok
        ? `IMAPS nasłuchuje na ${host}:993.`
        : `Brak IMAPS na ${host}:993 — uruchom profil (Exim + Dovecot).`,
      records: [
        { label: 'Host', actual: host },
        { label: 'Port', expected: '993 (TLS)', actual: '993', ok: probe.ok },
        { label: 'Sonda', actual: probe.error ?? (probe.ok ? 'połączenie OK' : 'błąd'), ok: probe.ok },
      ],
      doc: {
        vendor: 'DirectAdmin',
        statement:
          'Hosting współdzielony wymaga zbudowanego stosu pocztowego DirectAdmin CustomBuild (exim + dovecot) z nasłuchem IMAPS.',
        reference: 'https://docs.directadmin.com/directadmin/custombuild/',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkMailSmtp(host: string): Promise<NodeStackServiceCheckDto> {
    let probe = await this.probeTls(host, 587);
    let port = 587;
    if (!probe.ok) {
      const plain25 = await this.probeTcp(host, 25);
      if (plain25.ok) {
        probe = { ok: true };
        port = 25;
      }
    }
    return this.serviceCheck({
      id: 'mail-smtp',
      title: 'Poczta (SMTP)',
      required: true,
      ok: probe.ok,
      summary: probe.ok
        ? `SMTP dostępny na ${host}:${port}.`
        : `Brak SMTP na ${host}:587/:25 — uruchom profil (Exim).`,
      records: [
        { label: 'Host', actual: host },
        {
          label: 'Port',
          expected: '587 (TLS) lub 25',
          actual: String(port),
          ok: probe.ok,
        },
        { label: 'Sonda', actual: probe.error ?? 'połączenie OK', ok: probe.ok },
      ],
      doc: {
        vendor: 'DirectAdmin',
        statement: 'Submission :587 lub SMTP :25 musi nasłuchiwać po `build exim` i starcie usługi.',
        reference: 'https://docs.directadmin.com/directadmin/custombuild/',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkFtp(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTcp(host, 21);
    return this.serviceCheck({
      id: 'ftp',
      title: 'FTP',
      required: true,
      ok: probe.ok,
      summary: probe.ok
        ? `FTP nasłuchuje na ${host}:21.`
        : `Brak FTP na ${host}:21 — profil zbuduje pure-ftpd/proftpd (CustomBuild).`,
      records: [
        { label: 'Host', actual: host },
        { label: 'Port', expected: '21', actual: '21', ok: probe.ok },
        { label: 'Sonda', actual: probe.error ?? 'połączenie OK', ok: probe.ok },
      ],
      doc: {
        vendor: 'DirectAdmin',
        statement:
          'Konta FTP w panelu klienta wymagają działającego serwera FTP (typowo pure-ftpd przez CustomBuild).',
        reference: 'https://docs.directadmin.com/directadmin/custombuild/',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkMariaDb(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTcp(host, 3306);
    const blockedExternally =
      !probe.ok &&
      probe.error != null &&
      /econnrefused|timeout/i.test(probe.error);
    const ok = probe.ok;
    const status: AuditCheckStatus = ok ? 'OK' : blockedExternally ? 'WARN' : 'FAIL';
    return {
      id: 'mariadb',
      title: 'Baza danych (MariaDB)',
      required: true,
      status,
      summary: ok
        ? `MySQL/MariaDB nasłuchuje na ${host}:3306.`
        : blockedExternally
          ? `Port 3306 niedostępny z panelu (często firewall) — zweryfikuj na węźle: mysql -e "SELECT 1".`
          : `MariaDB nie odpowiada na ${host}:3306 — profil uruchomi Governor i usługę DB.`,
      records: [
        { label: 'Host', actual: host },
        { label: 'Port', expected: '3306', actual: '3306', ok },
        { label: 'Sonda zewnętrzna', actual: probe.error ?? 'połączenie OK', ok: probe.ok },
      ],
      docAttestation: [
        {
          vendor: 'CloudLinux',
          statement:
            'MySQL Governor + MariaDB 10.6 są wymagane dla baz klientów; instalacja przez profil hostingowy (mysqlgovernor.py).',
          reference: 'https://docs.cloudlinux.com/cloudlinuxos/shared_hosting_package/#mysql-governor',
          verifiedAt: '2026-06-01',
        },
      ],
    };
  }

  private async checkHttps(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTls(host, 443);
    return this.serviceCheck({
      id: 'https',
      title: 'HTTPS (WWW)',
      required: true,
      ok: probe.ok,
      summary: probe.ok
        ? `HTTPS na ${host}:443.`
        : `Brak HTTPS na ${host}:443 — sprawdź LiteSpeed i vhosty.`,
      records: [
        { label: 'Port', expected: '443', actual: '443', ok: probe.ok },
        {
          label: 'Certyfikat',
          actual: probe.authorized === false ? 'TLS (self-signed / niezweryfikowany)' : probe.ok ? 'TLS OK' : '—',
          ok: probe.ok,
        },
      ],
      doc: {
        vendor: 'LiteSpeed',
        statement: 'Strony klientów serwowane przez LiteSpeed na :443 po bootstrapie węzła.',
        reference: 'https://docs.litespeedtech.com/',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkHttp(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTcp(host, 80);
    return this.serviceCheck({
      id: 'http',
      title: 'HTTP (WWW)',
      required: false,
      ok: probe.ok,
      summary: probe.ok ? `HTTP na ${host}:80.` : `HTTP :80 niedostępny z panelu (opcjonalnie).`,
      records: [{ label: 'Port', expected: '80', actual: '80', ok: probe.ok }],
      doc: {
        vendor: 'LiteSpeed',
        statement: 'Port 80 dla przekierowań HTTP→HTTPS i weryfikacji ACME na kontach.',
        reference: 'https://docs.litespeedtech.com/',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkWebServer(host: string): Promise<NodeStackServiceCheckDto> {
    const probe = await this.probeTcp(host, 80);
    const https = await this.probeTls(host, 443);
    const ok = probe.ok || https.ok;
    return this.serviceCheck({
      id: 'webserver',
      title: 'Serwer WWW (LiteSpeed)',
      required: true,
      ok,
      summary: ok
        ? 'Serwer WWW odpowiada na :80 lub :443.'
        : 'LiteSpeed nie nasłuchuje na :80/:443 — bootstrap lub profil hostingowy.',
      records: [
        { label: ':80', actual: probe.ok ? 'nasłuch' : 'brak', ok: probe.ok },
        { label: ':443', actual: https.ok ? 'nasłuch TLS' : 'brak', ok: https.ok },
      ],
      doc: {
        vendor: 'LiteSpeed',
        statement: 'Węzeł compute wymaga LiteSpeed zainstalowanego przed bootstrap Verris.',
        reference: 'ops/docs/NODE_BOOTSTRAP_V2.md',
        verifiedAt: '2026-06-01',
      },
    });
  }

  private async checkDaPanel(server: Server): Promise<NodeStackServiceCheckDto> {
    const host = server.daHost?.trim() || server.hostname?.trim() || '';
    const port = server.daPort ?? 2222;
    if (!host) {
      return {
        id: 'da-panel',
        title: 'Panel DirectAdmin',
        required: true,
        status: 'FAIL',
        summary: 'Brak daHost — ustaw hostname i konfigurację DA.',
        records: [{ label: 'daHost', actual: 'brak', ok: false }],
        docAttestation: [
          {
            vendor: 'DirectAdmin',
            statement: 'API i provisioning wymagają działającego panelu DA na :2222.',
            reference: 'https://docs.directadmin.com/developer/api/',
            verifiedAt: '2026-06-01',
          },
        ],
      };
    }

    const tlsProbe = await this.probeTls(host, port);
    let apiOk = false;
    let apiDetail = 'nie testowano';
    if (server.daUsername && server.daPasswordEnc) {
      try {
        const result = await this.da.testConnection(server.id);
        apiOk = result.ok;
        apiDetail = result.ok ? 'API OK' : result.error ?? 'błąd API';
      } catch (err) {
        apiDetail = err instanceof Error ? err.message : String(err);
      }
    } else {
      apiDetail = 'brak login key w panelu — uzupełnij konfigurację DA';
    }

    const ok = tlsProbe.ok && apiOk;
    let status: AuditCheckStatus = 'OK';
    if (!tlsProbe.ok) status = 'FAIL';
    else if (!apiOk && server.daUsername) status = 'WARN';
    else if (!server.daUsername) status = 'WARN';

    return {
      id: 'da-panel',
      title: 'Panel DirectAdmin',
      required: true,
      status,
      summary: ok
        ? `DA ${host}:${port} — TLS i API OK.`
        : !tlsProbe.ok
          ? `Panel DA niedostępny na ${host}:${port} (TLS).`
          : `TLS OK, API: ${apiDetail}`,
      records: [
        { label: 'daHost', actual: host, ok: Boolean(host) },
        { label: 'Port', expected: String(port), actual: String(port) },
        { label: 'TLS :2222', actual: tlsProbe.error ?? 'OK', ok: tlsProbe.ok },
        { label: 'Test API', actual: apiDetail, ok: apiOk },
      ],
      docAttestation: [
        {
          vendor: 'DirectAdmin',
          statement:
            'Provisioning i limity planów używają CMD_API_* — wymagany login key ze scope packages + accounts.',
          reference: 'https://docs.directadmin.com/developer/api/',
          verifiedAt: '2026-06-01',
        },
      ],
    };
  }

  private checkCagefs(server: Server): NodeStackServiceCheckDto {
    const checkedAt = server.cagefsCheckedAt;
    const fresh = checkedAt ? Date.now() - checkedAt.getTime() < CAGEFS_FRESH_MS : false;
    const enabled = server.cagefsEnabled === true;
    let status: AuditCheckStatus = 'UNKNOWN';
    if (enabled && !checkedAt) {
      status = 'OK';
    } else if (fresh && enabled) {
      status = 'OK';
    } else if (fresh && !enabled) {
      status = 'FAIL';
    }
    return {
      id: 'cagefs',
      title: 'CloudLinux CageFS',
      required: true,
      status,
      summary:
        status === 'OK'
          ? 'CageFS aktywny (raport agenta).'
          : status === 'FAIL'
            ? 'CageFS wyłączony — profil hostingowy włączy izolację kont.'
            : 'Brak świeżego raportu CageFS z agenta.',
      records: [
        {
          label: 'Status',
          expected: 'enabled',
          actual: checkedAt ? (enabled ? 'enabled' : 'disabled') : 'brak danych',
          ok: enabled && fresh,
        },
        {
          label: 'Ostatni raport',
          actual: checkedAt?.toISOString() ?? 'brak',
        },
      ],
      docAttestation: [
        {
          vendor: 'CloudLinux',
          statement: 'CageFS wymagany dla izolacji kont i integracji LVE w DirectAdmin.',
          reference: 'https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#cagefs',
          verifiedAt: '2026-06-01',
        },
      ],
    };
  }

  private async checkGovernorHint(server: Server): Promise<NodeStackServiceCheckDto> {
    const latest = await this.prisma.nodeTask.findFirst({
      where: {
        serverId: server.id,
        kind: NodeTaskKind.HOSTING_PROFILE,
        status: { in: ['COMPLETED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const log = latest?.outputLog ?? '';
    const active =
      /MySQL Governor.*aktywny|Governor aktywny|dbctl list/i.test(log) &&
      !/Governor nieaktywny|dbctl nadal nie działa|Instalacja MySQL Governor nie powiodła/i.test(
        log,
      );
    const failed = /Instalacja MySQL Governor nie powiodła się|Governor nieaktywny/i.test(log);

    let status: AuditCheckStatus = 'UNKNOWN';
    let summary =
      'Governor weryfikowany na węźle (dbctl list) podczas profilu — uruchom „Zainstaluj usługi hostingowe”.';
    if (latest && active) {
      status = 'OK';
      summary = 'Ostatni profil hostingowy: MySQL Governor aktywny (dbctl).';
    } else if (latest && failed) {
      status = 'FAIL';
      summary = 'Ostatni profil: Governor nie przeszedł weryfikacji — sprawdź log zadania.';
    } else if (latest?.status === 'RUNNING' || latest?.status === 'QUEUED') {
      status = 'UNKNOWN';
      summary = 'Profil hostingowy w toku — Governor zostanie zweryfikowany po zakończeniu.';
    }

    return {
      id: 'governor',
      title: 'MySQL Governor',
      required: true,
      status,
      summary,
      records: [
        {
          label: 'Ostatni profil',
          actual: latest
            ? `${latest.status} (${latest.completedAt?.toISOString() ?? latest.createdAt.toISOString()})`
            : 'brak ukończonego zadania',
        },
        {
          label: 'Weryfikacja na węźle',
          actual: 'mysqlgovernor.py + dbctl list',
        },
      ],
      docAttestation: [
        {
          vendor: 'CloudLinux',
          statement: 'Governor ogranicza zużycie MySQL per konto LVE.',
          reference: 'https://docs.cloudlinux.com/cloudlinuxos/shared_hosting_package/#mysql-governor',
          verifiedAt: '2026-06-01',
        },
      ],
    };
  }

  private serviceCheck(opts: {
    id: string;
    title: string;
    required: boolean;
    ok: boolean;
    summary: string;
    records: AuditRecordField[];
    doc: DocAttestation;
  }): NodeStackServiceCheckDto {
    let status: AuditCheckStatus = opts.ok ? 'OK' : opts.required ? 'FAIL' : 'WARN';
    if (!opts.required && !opts.ok) status = 'WARN';
    return {
      id: opts.id,
      title: opts.title,
      required: opts.required,
      status,
      summary: opts.summary,
      records: opts.records,
      docAttestation: [opts.doc],
    };
  }

  private probeTcp(
    host: string,
    port: number,
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port, timeout: PROBE_TIMEOUT_MS }, () => {
        socket.end();
        resolve({ ok: true });
      });
      socket.on('error', (err) => resolve({ ok: false, error: err.message }));
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
    });
  }

  private probeTls(
    host: string,
    port: number,
  ): Promise<{ ok: boolean; authorized?: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: { ok: boolean; authorized?: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      const socket = tls.connect(
        { host, port, servername: host, rejectUnauthorized: true },
        () => {
          clearTimeout(timer);
          finish({ ok: true, authorized: socket.authorized });
          socket.end();
        },
      );

      const timer = setTimeout(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        finish({ ok: false, error: 'timeout' });
      }, PROBE_TIMEOUT_MS);

      socket.on('error', (err) => {
        clearTimeout(timer);
        const soft = tls.connect(
          { host, port, servername: host, rejectUnauthorized: false },
          () => {
            finish({ ok: true, authorized: false });
            soft.end();
          },
        );
        soft.on('error', () => finish({ ok: false, error: err.message }));
        soft.setTimeout(PROBE_TIMEOUT_MS, () => {
          soft.destroy();
          finish({ ok: false, error: err.message });
        });
      });
    });
  }
}

function worstStatus(statuses: AuditCheckStatus[]): AuditCheckStatus {
  const rank: Record<AuditCheckStatus, number> = {
    FAIL: 4,
    WARN: 3,
    UNKNOWN: 2,
    OK: 1,
  };
  let worst: AuditCheckStatus = 'OK';
  for (const s of statuses) {
    if (rank[s] > rank[worst]) worst = s;
  }
  return worst;
}

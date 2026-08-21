import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import { AuditService } from '../common/audit/audit.service';
import { MigrationActions } from '../common/audit/audit.actions';
import { assertPublicHost, basicAuth, resolvePublicHost } from './migration-net.util';

/**
 * O-2 / #18 — auto-discovery źródła migracji.
 *
 * Klient podaje host + login do panelu starego hostingu (cPanel / DirectAdmin /
 * Plesk). Serwis wykrywa typ panelu, loguje się przez API i zwraca listę
 * domen, baz danych i skrzynek e-mail, którą kreator w panelu klienta
 * pre-fill'uje do pakietu migracji. Sekrety NIE są tu nigdzie zapisywane —
 * wynik discovery to wyłącznie metadane. Transfer i tak idzie klasycznymi
 * kanałami (FTP/SFTP + mysqldump + imapsync), więc discovery jest tylko
 * wygodą, nie zależnością — awaria API panelu źródłowego niczego nie blokuje
 * (fallback ręczny).
 */

export type SourcePanelType = 'cpanel' | 'directadmin' | 'plesk';

export interface DiscoverSourceInput {
  host: string;
  port?: number;
  username: string;
  password: string;
  panelType?: SourcePanelType;
}

export interface DiscoveredDatabase {
  name: string;
  sizeMb: number | null;
}

export interface DiscoveredMailbox {
  email: string;
  sizeMb: number | null;
}

export interface DiscoveryResult {
  panelType: SourcePanelType;
  panelHost: string;
  panelPort: number;
  primaryDomain: string | null;
  domains: string[];
  databases: DiscoveredDatabase[];
  mailboxes: DiscoveredMailbox[];
  /** Podpowiedź dla kroku „pliki”: panelowe konto FTP zwykle działa na porcie 21. */
  ftpHint: { host: string; port: number; username: string; protocol: 'ftp' } | null;
  warnings: string[];
}

const PANEL_PORTS: Array<{ type: SourcePanelType; port: number }> = [
  { type: 'cpanel', port: 2083 },
  { type: 'directadmin', port: 2222 },
  { type: 'plesk', port: 8443 },
];

const HTTP_TIMEOUT_MS = 10_000;

interface PanelHttpResponse {
  status: number;
  body: string;
  insecureTlsUsed: boolean;
}

@Injectable()
export class MigrationDiscoveryService {
  private readonly logger = new Logger(MigrationDiscoveryService.name);

  constructor(private readonly audit: AuditService) {}

  async discover(input: DiscoverSourceInput, userId: string, subscriptionId: string): Promise<DiscoveryResult> {
    const host = input.host.trim().toLowerCase();
    await assertPublicHost(host);

    const warnings: string[] = [];
    const candidates: Array<{ type: SourcePanelType; port: number }> = input.panelType
      ? [{ type: input.panelType, port: input.port ?? defaultPortFor(input.panelType) }]
      : input.port
        ? PANEL_PORTS.map((c) => ({ ...c, port: input.port! }))
        : PANEL_PORTS;

    let lastError: string | null = null;
    for (const candidate of candidates) {
      try {
        const result = await this.discoverOne(candidate.type, host, candidate.port, input, warnings);
        await this.audit.record({
          action: MigrationActions.MIGRATION_DISCOVERY_RUN,
          userId,
          actorUserId: userId,
          details: {
            subscriptionId,
            panelType: result.panelType,
            host,
            port: result.panelPort,
            domains: result.domains.length,
            databases: result.databases.length,
            mailboxes: result.mailboxes.length,
          },
        });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.logger.debug(`discovery ${candidate.type}@${host}:${candidate.port} failed: ${lastError}`);
      }
    }

    await this.audit.record({
      action: MigrationActions.MIGRATION_DISCOVERY_RUN,
      userId,
      actorUserId: userId,
      details: { subscriptionId, host, result: 'failed', error: lastError },
    });
    throw new BadRequestException(
      `Nie udało się połączyć z panelem źródłowym (${host}). Sprawdź adres i dane logowania, ` +
        `albo przejdź do trybu ręcznego (FTP/MySQL/IMAP). Szczegóły: ${lastError ?? 'brak odpowiedzi'}`,
    );
  }

  private async discoverOne(
    type: SourcePanelType,
    host: string,
    port: number,
    input: DiscoverSourceInput,
    warnings: string[],
  ): Promise<DiscoveryResult> {
    switch (type) {
      case 'cpanel':
        return this.discoverCpanel(host, port, input.username, input.password, warnings);
      case 'directadmin':
        return this.discoverDirectAdmin(host, port, input.username, input.password, warnings);
      case 'plesk':
        return this.discoverPlesk(host, port, input.username, input.password, warnings);
    }
  }

  // --- cPanel (UAPI, basic auth) --------------------------------------------

  private async discoverCpanel(
    host: string,
    port: number,
    username: string,
    password: string,
    warnings: string[],
  ): Promise<DiscoveryResult> {
    const call = async (path: string) => {
      const res = await this.panelHttp(host, port, path, basicAuth(username, password), warnings);
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException('cPanel odrzucił dane logowania (401/403).');
      }
      if (res.status !== 200) throw new Error(`cPanel HTTP ${res.status} dla ${path}`);
      const parsed = JSON.parse(res.body) as {
        status?: number;
        data?: unknown;
        result?: { status?: number; data?: unknown; errors?: unknown };
      };
      // UAPI zwraca {result:{status,data}} albo (starsze buildy) {status,data}.
      const inner = parsed.result ?? parsed;
      if (inner.status !== 1) throw new Error(`cPanel API zwrócił błąd dla ${path}`);
      return inner.data;
    };

    const domainsData = (await call('/execute/DomainInfo/domains_data?format=hash')) as {
      main_domain?: { domain?: string };
      addon_domains?: Array<{ domain?: string }>;
      sub_domains?: Array<{ domain?: string }>;
      parked_domains?: Array<{ domain?: string } | string>;
    } | null;

    const domains = new Set<string>();
    const primaryDomain = domainsData?.main_domain?.domain ?? null;
    if (primaryDomain) domains.add(primaryDomain);
    for (const row of domainsData?.addon_domains ?? []) if (row?.domain) domains.add(row.domain);
    for (const row of domainsData?.parked_domains ?? []) {
      const d = typeof row === 'string' ? row : row?.domain;
      if (d) domains.add(d);
    }

    let databases: DiscoveredDatabase[] = [];
    try {
      const rows = (await call('/execute/Mysql/list_databases')) as Array<{
        database?: string;
        disk_usage?: number;
      }> | null;
      databases = (rows ?? [])
        .filter((r) => !!r.database)
        .map((r) => ({
          name: r.database!,
          sizeMb: typeof r.disk_usage === 'number' ? Math.round(r.disk_usage / 1024 / 1024) : null,
        }));
    } catch {
      warnings.push('Nie udało się pobrać listy baz MySQL z cPanel — dodaj bazy ręcznie.');
    }

    let mailboxes: DiscoveredMailbox[] = [];
    try {
      const rows = (await call('/execute/Email/list_pops_with_disk?no_validate=1')) as Array<{
        email?: string;
        login?: string;
        _diskused?: string | number;
      }> | null;
      mailboxes = (rows ?? [])
        .map((r) => ({ email: r.email ?? r.login ?? '', raw: r }))
        .filter((r) => r.email.includes('@'))
        .map((r) => ({
          email: r.email,
          sizeMb: toMb(r.raw._diskused),
        }));
    } catch {
      try {
        const rows = (await call('/execute/Email/list_pops?skip_main=1')) as Array<{
          email?: string;
        }> | null;
        mailboxes = (rows ?? [])
          .filter((r) => !!r.email && r.email.includes('@'))
          .map((r) => ({ email: r.email!, sizeMb: null }));
      } catch {
        warnings.push('Nie udało się pobrać listy skrzynek z cPanel — dodaj skrzynki ręcznie.');
      }
    }

    return {
      panelType: 'cpanel',
      panelHost: host,
      panelPort: port,
      primaryDomain,
      domains: [...domains],
      databases,
      mailboxes,
      ftpHint: { host, port: 21, username, protocol: 'ftp' },
      warnings,
    };
  }

  // --- DirectAdmin (CMD_API, basic auth, odpowiedzi urlencoded) --------------

  private async discoverDirectAdmin(
    host: string,
    port: number,
    username: string,
    password: string,
    warnings: string[],
  ): Promise<DiscoveryResult> {
    const call = async (path: string) => {
      const res = await this.panelHttp(host, port, path, basicAuth(username, password), warnings);
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException('DirectAdmin odrzucił dane logowania (401/403).');
      }
      if (res.status !== 200) throw new Error(`DirectAdmin HTTP ${res.status} dla ${path}`);
      if (res.body.includes('<html') || res.body.includes('DirectAdmin Login')) {
        throw new Error('DirectAdmin zwrócił stronę logowania zamiast odpowiedzi API.');
      }
      return parseDaList(res.body);
    };

    const domainList = await call('/CMD_API_SHOW_DOMAINS');
    if (domainList.error) {
      throw new BadRequestException(`DirectAdmin: ${domainList.error}`);
    }
    const domains = domainList.list;
    const primaryDomain = domains[0] ?? null;

    let databases: DiscoveredDatabase[] = [];
    try {
      const dbList = await call('/CMD_API_DATABASES');
      databases = dbList.list.map((name) => ({ name, sizeMb: null }));
    } catch {
      warnings.push('Nie udało się pobrać listy baz z DirectAdmin — dodaj bazy ręcznie.');
    }

    const mailboxes: DiscoveredMailbox[] = [];
    for (const domain of domains.slice(0, 25)) {
      try {
        const popList = await call(`/CMD_API_POP?action=list&domain=${encodeURIComponent(domain)}`);
        for (const local of popList.list) {
          if (local) mailboxes.push({ email: `${local}@${domain}`, sizeMb: null });
        }
      } catch {
        warnings.push(`Nie udało się pobrać skrzynek dla domeny ${domain} — dodaj je ręcznie.`);
      }
    }

    return {
      panelType: 'directadmin',
      panelHost: host,
      panelPort: port,
      primaryDomain,
      domains,
      databases,
      mailboxes,
      ftpHint: { host, port: 21, username, protocol: 'ftp' },
      warnings,
    };
  }

  // --- Plesk (REST API v2, best-effort) ---------------------------------------

  private async discoverPlesk(
    host: string,
    port: number,
    username: string,
    password: string,
    warnings: string[],
  ): Promise<DiscoveryResult> {
    const res = await this.panelHttp(host, port, '/api/v2/domains', basicAuth(username, password), warnings);
    if (res.status === 401 || res.status === 403) {
      throw new BadRequestException('Plesk odrzucił dane logowania (401/403).');
    }
    if (res.status !== 200) throw new Error(`Plesk HTTP ${res.status} dla /api/v2/domains`);

    const rows = JSON.parse(res.body) as Array<{ name?: string; hosting_type?: string }>;
    const domains = rows.map((r) => r.name).filter((n): n is string => !!n);
    warnings.push(
      'Plesk: API nie udostępnia listy baz i skrzynek w trybie klienta — uzupełnij je ręcznie w kolejnym kroku.',
    );

    return {
      panelType: 'plesk',
      panelHost: host,
      panelPort: port,
      primaryDomain: domains[0] ?? null,
      domains,
      databases: [],
      mailboxes: [],
      ftpHint: { host, port: 21, username, protocol: 'ftp' },
      warnings,
    };
  }

  // --- HTTP + bezpieczeństwo ---------------------------------------------------

  /**
   * HTTPS GET do panelu źródłowego. Najpierw z pełną walidacją TLS; jeśli
   * certyfikat jest zły (self-signed — częste na starych hostingach), ponawiamy
   * bez walidacji i dokładamy ostrzeżenie (transfer i tak wykona node, nie API).
   */
  private async panelHttp(
    host: string,
    port: number,
    path: string,
    authorization: string,
    warnings: string[],
  ): Promise<PanelHttpResponse> {
    // Anti-rebinding: rozwiązujemy host raz i łączymy się z tym IP; SNI i
    // nagłówek Host zostają oryginalną nazwą (weryfikacja certyfikatu panelu).
    const pinnedIp = await resolvePublicHost(host);
    const attempt = (rejectUnauthorized: boolean) =>
      new Promise<PanelHttpResponse>((resolve, reject) => {
        const req = https.request(
          {
            host: pinnedIp,
            servername: host,
            port,
            path,
            method: 'GET',
            rejectUnauthorized,
            timeout: HTTP_TIMEOUT_MS,
            headers: {
              Host: host,
              Authorization: authorization,
              Accept: 'application/json, text/plain, */*',
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > 5 * 1024 * 1024) {
                req.destroy(new Error('Odpowiedź panelu przekroczyła 5 MB.'));
                return;
              }
              chunks.push(chunk);
            });
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString('utf8'),
                insecureTlsUsed: !rejectUnauthorized,
              }),
            );
          },
        );
        req.on('timeout', () => req.destroy(new Error(`Timeout ${HTTP_TIMEOUT_MS / 1000}s`)));
        req.on('error', reject);
        req.end();
      });

    return attempt(true).catch((err: NodeJS.ErrnoException) => {
      const tlsError =
        typeof err.code === 'string' &&
        (err.code.startsWith('ERR_TLS') ||
          ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(
            err.code,
          ));
      if (!tlsError) throw err;
      if (!warnings.includes(INSECURE_TLS_WARNING)) warnings.push(INSECURE_TLS_WARNING);
      return attempt(false);
    });
  }

}

const INSECURE_TLS_WARNING =
  'Panel źródłowy ma niepoprawny certyfikat TLS — połączenie wykonano bez walidacji certyfikatu.';

function defaultPortFor(type: SourcePanelType): number {
  return PANEL_PORTS.find((c) => c.type === type)!.port;
}

function toMb(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  // cPanel `_diskused` bywa w bajtach.
  return n > 1024 * 1024 ? Math.round(n / 1024 / 1024) : Math.round(n);
}

/** DA CMD_API_* zwraca `list[]=a&list[]=b` lub `error=1&text=...` (urlencoded). */
function parseDaList(body: string): { list: string[]; error: string | null } {
  const params = new URLSearchParams(body.trim());
  if (params.get('error') === '1') {
    return { list: [], error: params.get('text') ?? params.get('details') ?? 'nieznany błąd DA' };
  }
  const list = params.getAll('list[]').filter(Boolean);
  return { list, error: null };
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import { AuditService } from '../common/audit/audit.service.js';
import { zdradzaPanelSerwera } from '../common/biala-etykieta.js';
import { MigrationActions } from '../common/audit/audit.actions.js';
import { assertPublicHost, basicAuth, resolvePublicHost } from './migration-net.util.js';

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
  /** Plesk: subskrypcja (konto), do której należy baza — kreator zaznacza bazy wybranej strony. */
  konto?: string;
}

/**
 * Strona na starym hostingu do wyboru w kreatorze (08.10, uwaga Dominika: klient z kilkoma stronami chce przenieść
 * jedną). `ftpPath` — katalog strony względem katalogu startowego FTP konta; null = nieznany (kreator zostawia
 * pole puste i worker szuka katalogu sam).
 */
export interface DiscoveredSite {
  domain: string;
  kind: 'main' | 'addon' | 'sub';
  ftpPath: string | null;
  /** Plesk: subskrypcja (konto) strony i jej login FTP. */
  konto?: string;
  ftpUser?: string;
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
  /** Strony z katalogami — do wyboru jednej w kreatorze. */
  sites: DiscoveredSite[];
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
    // White label: szczegóły z nazwą panelu lub portem 2222 zamieniłyby w filtrze API cały komunikat na ogólny.
    const szczegoly = !lastError ? 'brak odpowiedzi' : zdradzaPanelSerwera(lastError) ? 'brak poprawnej odpowiedzi panelu' : lastError;
    throw new BadRequestException(
      `Nie udało się połączyć z panelem źródłowym (${host}). Sprawdź adres i dane logowania, ` +
        `albo przejdź do trybu ręcznego (FTP/MySQL/IMAP). Szczegóły: ${szczegoly}`,
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

    // https://api.docs.cpanel.net/specifications/cpanel.openapi/domain-information/domaininfo-domains_data —
    // documentroot i homedir to ścieżki bezwzględne; main_domain w przykładzie dokumentacji jest obiektem, w schemacie
    // tablicą, więc przyjmujemy oba kształty.
    type WierszCpanel = { domain?: string; documentroot?: string; homedir?: string };
    const domainsData = (await call('/execute/DomainInfo/domains_data?format=hash')) as {
      main_domain?: WierszCpanel | WierszCpanel[];
      addon_domains?: WierszCpanel[];
      sub_domains?: WierszCpanel[];
      parked_domains?: Array<WierszCpanel | string>;
    } | null;

    const glowne = ([] as WierszCpanel[]).concat(domainsData?.main_domain ?? []);
    const domains = new Set<string>();
    const primaryDomain = glowne[0]?.domain ?? null;
    if (primaryDomain) domains.add(primaryDomain);
    for (const row of domainsData?.addon_domains ?? []) if (row?.domain) domains.add(row.domain);
    const sites = stronyCpanel(glowne, domainsData?.addon_domains ?? [], domainsData?.sub_domains ?? []);
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
      sites,
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
        throw new BadRequestException('Panel źródłowy odrzucił dane logowania (401/403).');
      }
      if (res.status !== 200) throw new Error(`Panel źródłowy: HTTP ${res.status}`);
      if (res.body.includes('<html') || res.body.includes('DirectAdmin Login')) {
        throw new Error('Panel źródłowy zwrócił stronę logowania zamiast odpowiedzi API.');
      }
      return parseDaList(res.body);
    };

    const domainList = await call('/CMD_API_SHOW_DOMAINS');
    if (domainList.error) {
      throw new BadRequestException(`Panel źródłowy: ${domainList.error}`);
    }
    const domains = domainList.list;
    const primaryDomain = domains[0] ?? null;

    // Katalogi stron: CMD_API_DOMAIN?action=document_root (JSON, od DA 1.59.2) —
    // https://docs.directadmin.com/directadmin/general-usage/directadmin-binary.html#show-documentroots
    // („These values are very dynamic… the only way to know the true value is to fully compute it”). Gdy panel tego nie
    // obsługuje — domyślny układ /domains/<domena>/public_html względem katalogu domowego (start FTP konta).
    let sites: DiscoveredSite[];
    try {
      const res = await this.panelHttp(host, port, '/CMD_API_DOMAIN?action=document_root', basicAuth(username, password), warnings);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      sites = stronyDirectAdmin(JSON.parse(res.body) as unknown, primaryDomain);
      if (!sites.length) throw new Error('pusta lista katalogów');
    } catch {
      sites = domains.map((d) => ({ domain: d, kind: d === primaryDomain ? ('main' as const) : ('addon' as const), ftpPath: `/domains/${d}/public_html` }));
    }

    let databases: DiscoveredDatabase[] = [];
    try {
      const dbList = await call('/CMD_API_DATABASES');
      databases = dbList.list.map((name) => ({ name, sizeMb: null }));
    } catch {
      warnings.push('Nie udało się pobrać listy baz z panelu źródłowego — dodaj bazy ręcznie.');
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
      sites,
      ftpHint: { host, port: 21, username, protocol: 'ftp' },
      warnings,
    };
  }

  // --- Plesk (XML API) ---------------------------------------------------------

  /**
   * XML API zamiast REST: REST v2 jest tylko dla administratora Pleska („Only the Plesk administrator can use REST API”,
   * https://docs.plesk.com/en-US/obsidian/api-rpc/about-rest-api.79359/), a klient migruje swoim loginem. XML API jest
   * dostępne także dla klientów („Access to XML API is granted to all customers by default”,
   * https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api.28709/). Nagłówki HTTP_AUTH_LOGIN/HTTP_AUTH_PASSWD
   * i Content-Type text/xml — https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api/xml-api-packets/a-sample-packet.50169/
   */
  private async discoverPlesk(
    host: string,
    port: number,
    username: string,
    password: string,
    warnings: string[],
  ): Promise<DiscoveryResult> {
    const pakiet = async (tresc: string): Promise<string> => {
      const res = await this.panelHttp(host, port, '/enterprise/control/agent.php', '', warnings, {
        method: 'POST',
        body: `<?xml version="1.0" encoding="UTF-8"?><packet>${tresc}</packet>`,
        headers: { HTTP_AUTH_LOGIN: username, HTTP_AUTH_PASSWD: password, 'Content-Type': 'text/xml' },
      });
      if (res.status === 401 || res.status === 403) throw new BadRequestException('Plesk odrzucił dane logowania (401/403).');
      if (res.status !== 200) throw new Error(`Plesk HTTP ${res.status} dla XML API`);
      const system = blokiXml(res.body, 'system')[0];
      if (system && tekstXml(system, 'status') === 'error') {
        // 1001 — błędny login lub hasło (kody błędów XML API Pleska).
        if (tekstXml(system, 'errcode') === '1001') throw new BadRequestException('Plesk odrzucił dane logowania.');
        throw new Error(`Plesk XML API: ${tekstXml(system, 'errtext') ?? 'błąd'}`);
      }
      return res.body;
    };

    // Subskrypcje (konta) — https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api/reference/managing-subscriptions/getting-information-about-subscriptions.33899/
    const webspaces = wynikiXml(await pakiet('<webspace><get><filter/><dataset><gen_info/></dataset></get></webspace>'))
      .map((r) => ({ id: tekstXml(r, 'id'), name: tekstXml(blokiXml(r, 'gen_info')[0] ?? '', 'name')?.toLowerCase() ?? null }))
      .filter((w): w is { id: string; name: string } => !!w.id && !!w.name)
      .slice(0, 50);
    const kontoPoId = new Map(webspaces.map((w) => [w.id, w.name]));

    // Strony: główna strona subskrypcji tylko z filtrem po nazwie, pozostałe strony i poddomeny z pustym filtrem —
    // https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api/reference/managing-sites-domains/getting-information-about-sites.66583/
    const strony: DiscoveredSite[] = [];
    const dodaj = (wynik: string, kind: DiscoveredSite['kind'] | null) => {
      const gen = blokiXml(wynik, 'gen_info')[0] ?? '';
      const domain = tekstXml(gen, 'name')?.toLowerCase();
      if (!domain || strony.some((x) => x.domain === domain)) return;
      const konto = kontoPoId.get(tekstXml(gen, 'webspace-id') ?? '') ?? (kind === 'main' ? domain : undefined);
      const wl = wlasciwosciXml(blokiXml(wynik, 'hosting')[0] ?? '');
      const wwwRoot = wl.get('www_root') ?? null;
      const rodzaj = kind ?? (strony.some((x) => domain.endsWith(`.${x.domain}`)) ? 'sub' : 'addon');
      strony.push({ domain, kind: rodzaj, ftpPath: sciezkaFtpPleska(wwwRoot, konto), konto, ftpUser: wl.get('ftp_login') ?? undefined });
    };
    for (const w of webspaces.slice(0, 30)) {
      const wynik = wynikiXml(await pakiet(`<site><get><filter><name>${escXml(w.name)}</name></filter><dataset><gen_info/><hosting/></dataset></get></site>`))[0];
      if (wynik && tekstXml(wynik, 'status') === 'ok') dodaj(wynik, 'main');
    }
    try {
      for (const wynik of wynikiXml(await pakiet('<site><get><filter/><dataset><gen_info/><hosting/></dataset></get></site>'))) {
        if (tekstXml(wynik, 'status') === 'ok') dodaj(wynik, null);
      }
    } catch {
      warnings.push('Plesk: nie udało się pobrać dodatkowych stron i poddomen — wybierz stronę główną albo wpisz katalog ręcznie.');
    }
    // Kolejność: strona główna, potem jej dodatkowe strony i poddomeny.
    strony.sort((a, b) => (a.konto ?? '').localeCompare(b.konto ?? '') || Number(b.kind === 'main') - Number(a.kind === 'main'));

    // Bazy — https://docs.plesk.com/en-US/obsidian/api-rpc/about-xml-api/reference/managing-databases/retrieving-information-about-databases.34431/
    let databases: DiscoveredDatabase[] = [];
    try {
      databases = wynikiXml(await pakiet('<database><get-db><filter/></get-db></database>'))
        .filter((r) => tekstXml(r, 'status') === 'ok' && (tekstXml(r, 'type') ?? 'mysql') === 'mysql')
        .map((r) => ({ name: tekstXml(r, 'name') ?? '', sizeMb: null, konto: kontoPoId.get(tekstXml(r, 'webspace-id') ?? '') }))
        .filter((d) => !!d.name);
    } catch {
      warnings.push('Plesk: nie udało się pobrać listy baz — dodaj bazy ręcznie.');
    }
    warnings.push('Plesk: listy skrzynek nie pobieramy — pocztę przenosisz w formularzu „Poczta” albo w trybie „Wszystko naraz”.');

    const domains = strony.filter((x) => x.kind !== 'sub').map((x) => x.domain);
    return {
      panelType: 'plesk',
      panelHost: host,
      panelPort: port,
      primaryDomain: strony.find((x) => x.kind === 'main')?.domain ?? domains[0] ?? null,
      domains,
      databases,
      mailboxes: [],
      sites: strony,
      ftpHint: { host, port: 21, username: strony.find((x) => x.kind === 'main')?.ftpUser ?? username, protocol: 'ftp' },
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
    opcje?: { method: 'POST'; body: string; headers: Record<string, string> },
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
            method: opcje?.method ?? 'GET',
            rejectUnauthorized,
            timeout: HTTP_TIMEOUT_MS,
            headers: {
              Host: host,
              ...(authorization ? { Authorization: authorization } : {}),
              Accept: 'application/json, text/plain, */*',
              ...(opcje ? { ...opcje.headers, 'Content-Length': String(Buffer.byteLength(opcje.body)) } : {}),
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
        req.end(opcje?.body);
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
    return { list: [], error: params.get('text') ?? params.get('details') ?? 'nieznany błąd' };
  }
  const list = params.getAll('list[]').filter(Boolean);
  return { list, error: null };
}

// --- strony i katalogi ---------------------------------------------------------

/** cPanel: katalog strony względem katalogu domowego (start głównego konta FTP). Poddomeny-bliźniaki domen dodatkowych pomijamy. */
export function stronyCpanel(
  glowne: Array<{ domain?: string; documentroot?: string; homedir?: string }>,
  dodatkowe: Array<{ domain?: string; documentroot?: string; homedir?: string }>,
  poddomeny: Array<{ domain?: string; documentroot?: string; homedir?: string }>,
): DiscoveredSite[] {
  const wzgledna = (w: { documentroot?: string; homedir?: string }): string | null => {
    const doc = w.documentroot?.replace(/\/+$/, '');
    const dom = w.homedir?.replace(/\/+$/, '');
    if (!doc || !dom || !doc.startsWith(`${dom}/`)) return null;
    return doc.slice(dom.length);
  };
  const strony: DiscoveredSite[] = [];
  const katalogi = new Set<string>();
  for (const [lista, kind] of [[glowne, 'main'], [dodatkowe, 'addon'], [poddomeny, 'sub']] as const) {
    for (const w of lista) {
      const domain = w.domain?.toLowerCase();
      if (!domain || strony.some((x) => x.domain === domain)) continue;
      const ftpPath = wzgledna(w);
      // cPanel zakłada dla domeny dodatkowej poddomenę z tym samym katalogiem — to ta sama strona.
      if (kind === 'sub' && ftpPath && katalogi.has(ftpPath)) continue;
      if (ftpPath) katalogi.add(ftpPath);
      strony.push({ domain, kind, ftpPath });
    }
  }
  return strony;
}

/**
 * DirectAdmin `action=document_root`: { "domena": { public_html, private_html, subdomains: { sub: { public_html } } } }.
 * Ścieżki są bezwzględne (/home/<użytkownik>/…); FTP głównego konta startuje w katalogu domowym.
 */
export function stronyDirectAdmin(json: unknown, glowna: string | null): DiscoveredSite[] {
  if (!json || typeof json !== 'object') return [];
  const wzgledna = (p: unknown): string | null => {
    if (typeof p !== 'string') return null;
    const m = /^\/home\/[^/]+(\/.+?)\/*$/.exec(p);
    return m ? m[1]! : null;
  };
  const strony: DiscoveredSite[] = [];
  for (const [nazwa, wpis] of Object.entries(json as Record<string, unknown>)) {
    if (!wpis || typeof wpis !== 'object' || !('public_html' in wpis)) continue;
    const domain = nazwa.toLowerCase();
    const w = wpis as { public_html?: unknown; subdomains?: Record<string, { public_html?: unknown }> };
    strony.push({ domain, kind: domain === glowna?.toLowerCase() ? 'main' : 'addon', ftpPath: wzgledna(w.public_html) });
    for (const [sub, sw] of Object.entries(w.subdomains ?? {})) {
      strony.push({ domain: `${sub.toLowerCase()}.${domain}`, kind: 'sub', ftpPath: wzgledna(sw?.public_html) });
    }
  }
  return strony.sort((a, b) => Number(b.kind === 'main') - Number(a.kind === 'main'));
}

/** Plesk: www_root względem katalogu subskrypcji /var/www/vhosts/<subskrypcja> (start FTP subskrypcji); Windows i inne układy — null. */
export function sciezkaFtpPleska(wwwRoot: string | null, konto: string | undefined): string | null {
  if (!wwwRoot || !konto) return null;
  const prefiks = `/var/www/vhosts/${konto}`;
  const sciezka = wwwRoot.replace(/\/+$/, '');
  return sciezka.startsWith(`${prefiks}/`) ? sciezka.slice(prefiks.length) : null;
}

// --- minimalny odczyt odpowiedzi XML API Pleska (płaskie węzły, bez atrybutów) ----

const ENCJE: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

function odkodujXml(v: string): string {
  return v.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENCJE[m] ?? m).trim();
}

function escXml(v: string): string {
  return v.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Wszystkie wystąpienia <tag>…</tag> (bez zagnieżdżeń tego samego tagu). */
export function blokiXml(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]!);
}

export function tekstXml(xml: string, tag: string): string | null {
  const b = blokiXml(xml, tag)[0];
  return b === undefined ? null : odkodujXml(b);
}

function wynikiXml(xml: string): string[] {
  return blokiXml(xml, 'result');
}

/** <property><name>…</name><value>…</value></property> → mapa. */
export function wlasciwosciXml(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of blokiXml(xml, 'property')) {
    const n = tekstXml(p, 'name');
    if (n) m.set(n, tekstXml(p, 'value') ?? '');
  }
  return m;
}

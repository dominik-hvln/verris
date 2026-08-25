import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DirectAdminClient, mergeAdminSettingsPayload } from '@verris/directadmin-sdk';
import type {
  DeployFrequency,
  DeployJobDto,
  DeployJobsResponseDto,
  HostingSslRowDto,
  HostingSslStatus,
  HostingStagingCreatedDto,
  HostingStagingDatabaseDto,
  HostingStagingEnvDto,
  HostingStagingResponseDto,
  ServiceConnectionInfoDto,
} from '@verris/contracts';
import { randomBytes, X509Certificate } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { buildDaPackageSpecFromPlan, planResourceFields } from './da-package-spec';
import { resolveHostingPrimaryDomain } from './hosting-primary-domain';

export interface WebToolsState {
  redirects: Array<{ from: string; to: string; type: '301' | '302' }>;
  hotlink: { enabled: boolean; extensions: string; allow: string[] };
  blockedIps: string[];
  protectedDirs: string[];
  forceHttps?: boolean;
  wwwMode?: 'none' | 'www' | 'nonwww';
}

/**
 * Resolves a Server record into a configured DirectAdminClient instance.
 * The DA password is decrypted on demand using the application KMS key.
 */
@Injectable()
export class DirectAdminService {
  private readonly logger = new Logger(DirectAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  async getClientForServer(serverId: string): Promise<DirectAdminClient> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    if (!server.daHost || !server.daPort || !server.daUsername || !server.daPasswordEnc) {
      throw new BadRequestException(
        'DirectAdmin is not configured for this server. Set DA host/port/username/password first.',
      );
    }

    const loginKey = this.crypto.decrypt(server.daPasswordEnc);

    return new DirectAdminClient({
      host: server.daHost,
      port: server.daPort,
      username: server.daUsername,
      loginKey,
      secure: server.daUseTls,
      // Audit F-04: cert verification ON unless the node explicitly opted out
      // (onboarding window with a self-signed cert on :2222).
      rejectUnauthorized: !server.daAllowInvalidCert,
    });
  }

  /**
   * Po przypisaniu markowych NS do węzła (OVH): ustawia domyślne NS w DirectAdmin
   * (Admin Settings + domyślne NS resellerów) i synchronizuje istniejące konta hostingowe.
   */
  async applyBrandedNameserversOnNode(
    serverId: string,
    ns1: string,
    ns2: string,
  ): Promise<{
    adminSettings: 'updated' | 'unchanged' | 'skipped' | 'error';
    adminSettingsDetail: string | null;
    nameServerDefaults: 'updated' | 'unchanged' | 'skipped' | 'error';
    hostingAccounts: { updated: number; skipped: number; failed: number };
  }> {
    const skipped = {
      adminSettings: 'skipped' as const,
      adminSettingsDetail: null as string | null,
      nameServerDefaults: 'skipped' as const,
      hostingAccounts: { updated: 0, skipped: 0, failed: 0 },
    };
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server?.daHost || !server.daPasswordEnc) return skipped;

    const n1 = ns1.trim();
    const n2 = ns2.trim();
    if (!n1 || !n2) return skipped;

    let client: DirectAdminClient;
    try {
      client = await this.getClientForServer(serverId);
    } catch (err) {
      this.logger.warn(
        `applyBrandedNameserversOnNode server=${serverId}: ${(err as Error).message}`,
      );
      return {
        adminSettings: 'error',
        adminSettingsDetail: (err as Error).message,
        nameServerDefaults: 'error',
        hostingAccounts: { updated: 0, skipped: 0, failed: 0 },
      };
    }

    const norm = (d: string) => d.trim().toLowerCase();
    let adminSettings: 'updated' | 'unchanged' | 'error' = 'updated';
    let adminSettingsDetail: string | null = null;
    try {
      const axiosClient = (client as unknown as { client?: { get: Function } }).client;
      let currentNs1 = '';
      let currentNs2 = '';
      if (axiosClient) {
        for (const getPath of ['/CMD_ADMIN_SETTINGS', '/CMD_API_ADMIN_SETTINGS'] as const) {
          try {
            const getRes = await axiosClient.get(getPath, {
              params: { json: 'yes' },
              timeout: 15_000,
            });
            const cur = mergeAdminSettingsPayload(getRes?.data);
            currentNs1 = cur.ns1 ?? '';
            currentNs2 = cur.ns2 ?? '';
            if (currentNs1 || currentNs2) break;
          } catch {
            // try alternate GET
          }
        }
      }
      if (norm(currentNs1) === norm(n1) && norm(currentNs2) === norm(n2)) {
        adminSettings = 'unchanged';
        adminSettingsDetail = 'Już ustawione w Admin Settings.';
      } else {
        await client.setAdminDefaultNameservers(n1, n2);
        adminSettingsDetail = 'Zapisano przez CMD_ADMIN_SETTINGS.';
      }
    } catch (err) {
      adminSettings = 'error';
      adminSettingsDetail = (err as Error).message;
      this.logger.warn(
        `DA Admin Settings ns1/ns2 server=${serverId}: ${adminSettingsDetail}`,
      );
    }

    let nameServerDefaults: 'updated' | 'unchanged' | 'error' = 'updated';
    try {
      await client.setResellerDefaultNameservers(n1, n2);
    } catch (err) {
      nameServerDefaults = 'error';
      this.logger.warn(
        `DA NAME_SERVER defaults server=${serverId}: ${(err as Error).message}`,
      );
    }

    const accounts = await this.prisma.account.findMany({
      where: { serverId, status: 'ACTIVE' },
      select: { daUsername: true },
    });
    let updated = 0;
    let failed = 0;
    let skippedAccounts = 0;
    for (const acc of accounts) {
      try {
        await client.setUserNameservers(acc.daUsername, n1, n2);
        updated += 1;
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (/already|unchanged|identical/i.test(msg)) {
          skippedAccounts += 1;
        } else {
          failed += 1;
          this.logger.warn(
            `DA user NS sync server=${serverId} user=${acc.daUsername}: ${msg}`,
          );
        }
      }
    }

    return {
      adminSettings,
      adminSettingsDetail,
      nameServerDefaults,
      hostingAccounts: { updated, skipped: skippedAccounts, failed },
    };
  }

  /**
   * Verifies the DA credentials *and* the login-key scope required for
   * provisioning: listing packages (CMD_API_PACKAGES_USER) and accounts
   * (CMD_API_SHOW_USERS). A key that can read domains but not packages/accounts
   * passes the old "ping" test yet fails real provisioning — so we probe both.
   */
  async testConnection(serverId: string): Promise<{
    ok: boolean;
    sampleCount?: number;
    error?: string;
    scope?: { packages: boolean; accounts: boolean; packageCount: number | null };
  }> {
    let client: DirectAdminClient;
    try {
      client = await this.getClientForServer(serverId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }

    let sampleCount: number | undefined;
    try {
      const domains = await client.getDomains();
      sampleCount = domains.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DA test (connectivity) failed for server=${serverId}: ${msg}`);
      return { ok: false, error: msg };
    }

    let packages = false;
    let packageCount: number | null = null;
    let accounts = false;
    const scopeErrors: string[] = [];
    try {
      const list = await client.listUserPackages();
      packages = true;
      packageCount = list.length;
    } catch (err) {
      scopeErrors.push(`pakiety: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await client.listAccounts();
      accounts = true;
    } catch (err) {
      scopeErrors.push(`konta: ${err instanceof Error ? err.message : String(err)}`);
    }

    const scope = { packages, accounts, packageCount };
    if (!packages || !accounts) {
      return {
        ok: false,
        sampleCount,
        scope,
        error: `Login key działa, ale brakuje uprawnień (scope) — ${scopeErrors.join('; ')}. Wygeneruj klucz ze scope: packages + accounts.`,
      };
    }
    return { ok: true, sampleCount, scope };
  }

  /**
   * DirectAdmin jako użytkownik hostingowy (hasło konta po provisioningu).
   * Używane do CMD_API_SHOW_DOMAINS dla konkretnego konta klienta.
   */
  async getClientForHostingAccount(accountId: string, ownerUserId: string): Promise<DirectAdminClient> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId: ownerUserId },
      include: { server: true },
    });
    if (!account) throw new NotFoundException('Hosting account not found');
    if (!account.daPasswordEnc) {
      throw new BadRequestException(
        'Brak zapisanych danych logowania DirectAdmin dla tego konta (tylko konto z provisioningu).',
      );
    }
    const server = account.server;
    const host = server.hostname ?? server.daHost ?? server.ipAddress;
    const port = server.daPort ?? 2222;
    const loginKey = this.crypto.decrypt(account.daPasswordEnc);
    return new DirectAdminClient({
      host,
      port,
      username: account.daUsername,
      loginKey,
      secure: server.daUseTls,
      rejectUnauthorized: !server.daAllowInvalidCert,
    });
  }

  /**
   * A1 — wystawienie/odnowienie certyfikatu Let's Encrypt dla konta klienta.
   * Best-effort: jeśli DNS jeszcze nie wskazuje na węzeł, DA zwróci błąd ACME —
   * w tym wypadku DA i tak ponowi przy `letsencrypt=1` (auto-issue), a klient
   * może kliknąć „Wystaw SSL" w panelu, gdy DNS się rozpropaguje.
   */
  async requestLetsEncryptForSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<{ ok: boolean; domain: string | null; error: string | null }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub?.account) throw new NotFoundException('Service not found');
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    try {
      await client.requestLetsEncrypt(sub.account.domain);
      return { ok: true, domain: sub.account.domain, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`requestLetsEncrypt failed sub=${subscriptionId}: ${msg}`);
      return { ok: false, domain: sub.account.domain, error: msg };
    }
  }

  /**
   * A1 — wewnętrzny best-effort trigger LE używany zaraz po provisioningu
   * (mamy świeże hasło konta w pamięci, bez odczytu z DB).
   */
  async requestLetsEncryptDirect(
    server: { hostname: string | null; daHost: string | null; ipAddress: string | null; daPort: number | null; daUseTls: boolean; daAllowInvalidCert: boolean },
    daUsername: string,
    password: string,
    domain: string,
  ): Promise<void> {
    const host = server.hostname ?? server.daHost ?? server.ipAddress ?? '';
    const client = new DirectAdminClient({
      host,
      port: server.daPort ?? 2222,
      username: daUsername,
      loginKey: password,
      secure: server.daUseTls,
      rejectUnauthorized: !server.daAllowInvalidCert,
    });
    await client.requestLetsEncrypt(domain);
  }

  /**
   * Lista domen przypiętych do konta DA dla subskrypcji (panel klienta → szczegóły usługi).
   */
  async listHostingDomainsForSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<{
    domains: { name: string }[];
    daUsername: string | null;
    primaryDomain: string | null;
    fetchError: string | null;
  }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      return { domains: [], daUsername: null, primaryDomain: null, fetchError: null };
    }
    let primaryDomain = sub.account.domain;
    if (!sub.account.daPasswordEnc) {
      return {
        domains: [],
        daUsername: sub.account.daUsername,
        primaryDomain,
        fetchError:
          'Konto hostingowe nie ma jeszcze zapisanych danych logowania DirectAdmin (oczekuje na provisioning).',
      };
    }
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const names = await client.getDomains();
      primaryDomain = await this.syncPrimaryDomainFromDirectAdmin(sub.account, client, names);
      return {
        domains: names.map((name) => ({ name })),
        daUsername: sub.account.daUsername,
        primaryDomain,
        fetchError: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingDomainsForSubscription sub=${subscriptionId}: ${msg}`);
      return {
        domains: [],
        daUsername: sub.account.daUsername,
        primaryDomain,
        fetchError: msg,
      };
    }
  }

  /**
   * Synchronizuje Account.domain z DirectAdmin (gdy klient zmieni domenę w DA).
   * Zwraca aktualną główną domenę po syncu.
   */
  async syncPrimaryDomainForSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<string | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub?.account) return null;
    if (!sub.account.daPasswordEnc) return sub.account.domain;
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      return await this.syncPrimaryDomainFromDirectAdmin(sub.account, client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`syncPrimaryDomainForSubscription sub=${subscriptionId}: ${msg}`);
      return sub.account.domain;
    }
  }

  private async readDaUserConfigDomain(client: DirectAdminClient): Promise<string | null> {
    const axiosClient = (client as unknown as { client?: { get: Function } }).client;
    if (!axiosClient) return null;
    try {
      const res = await axiosClient.get('/CMD_API_SHOW_USER_CONFIG', { timeout: 15_000 });
      const config = this.parseKvPayload(String(res?.data ?? ''));
      const domain = config.get('domain')?.trim();
      return domain || null;
    } catch {
      return null;
    }
  }

  private async syncPrimaryDomainFromDirectAdmin(
    account: { id: string; domain: string },
    client: DirectAdminClient,
    prefetchedDomains?: string[],
  ): Promise<string> {
    const daDomains = prefetchedDomains ?? (await client.getDomains());
    const daConfigDomain = await this.readDaUserConfigDomain(client);
    const resolved = resolveHostingPrimaryDomain({
      storedDomain: account.domain,
      daConfigDomain,
      daDomains,
    });

    if (
      !resolved ||
      resolved.trim().toLowerCase() === account.domain.trim().toLowerCase()
    ) {
      return account.domain;
    }

    try {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { domain: resolved },
      });
      this.logger.log(
        `Primary domain synced account=${account.id}: ${account.domain} → ${resolved} (DA: ${daDomains.join(', ')})`,
      );
      return resolved;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(
          `Primary domain sync skipped account=${account.id}: ${resolved} already assigned`,
        );
        return account.domain;
      }
      throw err;
    }
  }

  /** Hostname węzła do linków panelu (preferuj DNS węzła zamiast surowego IP). */
  hostingPanelDisplayHost(server: {
    hostname: string | null;
    daHost: string | null;
    ipAddress: string | null;
  }): string {
    return server.hostname ?? server.daHost ?? server.ipAddress ?? 'localhost';
  }

  /** URL do panelu użytkownika DA (Evolution) — bez logowania. */
  hostingPanelBaseUrl(server: {
    hostname: string | null;
    daHost: string | null;
    daPort: number | null;
    daUseTls: boolean;
    ipAddress: string | null;
  }): string {
    const host = this.hostingPanelDisplayHost(server);
    const port = server.daPort ?? 2222;
    const secure = server.daUseTls !== false;
    return `${secure ? 'https' : 'http'}://${host}:${port}`;
  }

  /** Deep-linki do Evolution skin (DirectAdmin ≥1.6). */
  hostingEvolutionLinks(panelBaseUrl: string, domain: string): {
    databasesUrl: string;
    emailUrl: string;
    sslUrl: string;
    fileManagerUrl: string;
    domainsUrl: string;
    dnsUrl: string;
    domainManageUrl: string;
  } {
    const domainPath = encodeURIComponent(domain);
    return {
      databasesUrl: `${panelBaseUrl}/evo/user/databases/mysql`,
      emailUrl: `${panelBaseUrl}/evo/user/email/accounts`,
      sslUrl: `${panelBaseUrl}/evo/user/ssl`,
      fileManagerUrl: `${panelBaseUrl}/evo/user/filemanager/domains/${domainPath}`,
      domainsUrl: `${panelBaseUrl}/evo/user/domains`,
      dnsUrl: `${panelBaseUrl}/evo/user/dns`,
      domainManageUrl: `${panelBaseUrl}/evo/user/domains/domain/${domainPath}`,
    };
  }

  /**
   * Lista baz MySQL z CMD_API_DATABASES (sesja jak dla domen).
   */
  async listHostingMysqlForSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<{
    databases: { name: string }[];
    daUsername: string | null;
    engine: { name: string; version: string } | null;
    fetchError: string | null;
  }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      return { databases: [], daUsername: null, engine: null, fetchError: null };
    }
    const daUsername = sub.account.daUsername;
    // DB-1 — realny silnik+wersja bazy z węzła (bez mocków). Czytamy łańcuch
    // wersji z powitalnego pakietu MySQL/MariaDB na :3306 (przed autoryzacją),
    // więc nie potrzebujemy żadnych poświadczeń. Best-effort — gdy port zamknięty
    // (firewall), po prostu nie pokazujemy wersji.
    // Preferujemy wersję raportowaną przez agenta węzła (telemetria), bo port
    // 3306 jest zwykle zamknięty z control-plane. Greeting-probe zostaje jako
    // fallback dla węzłów współlokowanych / osiągalnych po 3306.
    const srv = sub.account.server;
    let engine: { name: string; version: string } | null =
      srv?.dbEngine && srv?.dbVersion ? { name: srv.dbEngine, version: srv.dbVersion } : null;
    if (!engine) {
      const engineHost = srv?.hostname || srv?.ipAddress || null;
      engine = engineHost ? await this.probeDbEngineVersion(engineHost) : null;
    }
    if (!sub.account.daPasswordEnc) {
      return {
        databases: [],
        daUsername,
        engine,
        fetchError:
          'Brak zapisanego dostępu do DirectAdmin dla tego konta (provisioningu).',
      };
    }
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const names = await client.listMysqlDatabases();
      return {
        databases: names.map((name) => ({ name })),
        daUsername,
        engine,
        fetchError: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingMysqlForSubscription sub=${subscriptionId}: ${msg}`);
      return {
        databases: [],
        daUsername,
        engine,
        fetchError: msg,
      };
    }
  }

  /**
   * DB-1 — odczytuje silnik i wersję bazy z powitalnego pakietu MySQL/MariaDB
   * (handshake v10) na porcie 3306. Serwer wysyła wersję zaraz po nawiązaniu
   * połączenia TCP, jeszcze przed logowaniem — nie używamy żadnych poświadczeń.
   * MariaDB zwraca np. „5.5.5-10.6.18-MariaDB-…”, MySQL np. „8.0.36”.
   */
  private probeDbEngineVersion(
    host: string,
    port = 3306,
    timeoutMs = 2500,
  ): Promise<{ name: string; version: string } | null> {
    return new Promise((resolve) => {
      // `require` zamiast importu na górze pliku — moduł ładowany dopiero tutaj,
      // wyłącznie na potrzeby tej sondy. Stała tu dyrektywa wyciszająca
      // `no-var-requires`; reguła została przemianowana na `no-require-imports`,
      // więc dyrektywa przestała cokolwiek wyciszać i `--fix` ją usunął (X-42).
      const net = require('net') as typeof import('net');
      let settled = false;
      const done = (val: { name: string; version: string } | null) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        resolve(val);
      };
      const socket = net.createConnection({ host, port });
      socket.setTimeout(timeoutMs);
      socket.once('data', (buf: Buffer) => {
        try {
          // 4 bajty nagłówka pakietu, potem 1 bajt protocol version (10),
          // następnie null-zakończony łańcuch wersji serwera.
          if (buf.length < 6 || buf[4] !== 10) return done(null);
          const end = buf.indexOf(0x00, 5);
          if (end < 0) return done(null);
          let version = buf.toString('latin1', 5, end).trim();
          if (!version) return done(null);
          // MariaDB poprzedza wersję „5.5.5-” dla kompatybilności — usuwamy.
          version = version.replace(/^5\.5\.5-/, '');
          const isMaria = /mariadb/i.test(version);
          const name = isMaria ? 'MariaDB' : 'MySQL';
          // Wytnij sam numer (np. „10.6.18” lub „8.0.36”).
          const num = version.match(/^\d+\.\d+\.\d+/)?.[0] ?? version.split('-')[0];
          done({ name, version: num });
        } catch {
          done(null);
        }
      });
      socket.once('timeout', () => done(null));
      socket.once('error', () => done(null));
    });
  }

  /** Creates a MySQL database + user on the account (in-panel DB management). */
  async createHostingMysqlDatabase(
    subscriptionId: string,
    userId: string,
    input: { name: string; user: string; password: string },
  ): Promise<{ database: string; username: string }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.id || !sub.account.daPasswordEnc) {
      throw new BadRequestException('Konto hostingowe nie jest jeszcze gotowe.');
    }
    const namePart = /^[a-zA-Z0-9_]{1,16}$/;
    if (!namePart.test(input.name)) {
      throw new BadRequestException('Nazwa bazy: 1–16 znaków (litery, cyfry, _).');
    }
    if (!namePart.test(input.user)) {
      throw new BadRequestException('Nazwa użytkownika: 1–16 znaków (litery, cyfry, _).');
    }
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Hasło bazy musi mieć co najmniej 8 znaków.');
    }
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    const result = await client.createMysqlDatabase({
      name: input.name,
      user: input.user,
      password: input.password,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: sub.account.id, database: result.database },
    });
    return result;
  }

  /** Deletes a MySQL database (full prefixed name, as returned by listing). */
  async deleteHostingMysqlDatabase(
    subscriptionId: string,
    userId: string,
    fullName: string,
  ): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.id || !sub.account.daPasswordEnc) {
      throw new BadRequestException('Konto hostingowe nie jest jeszcze gotowe.');
    }
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    await client.deleteMysqlDatabase(fullName);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: sub.account.id, database: fullName },
    });
    return { ok: true as const };
  }

  private parseKvPayload(payload: unknown): URLSearchParams {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if ('error' in record) {
        const err = String(record.error ?? '');
        if (err && err !== '0' && err !== 'false') {
          throw new BadRequestException(
            String(record.text ?? record.details ?? record.message ?? 'DirectAdmin error'),
          );
        }
      }
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(record)) {
        if (value == null) continue;
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (item != null && String(item).trim()) {
              params.set(`list${index}`, String(item));
            }
          });
          continue;
        }
        if (typeof value === 'object') continue;
        params.set(key, String(value));
      }
      return params;
    }
    return new URLSearchParams(typeof payload === 'string' ? payload : String(payload ?? ''));
  }

  /** Values from DA list responses (`list0`, `list1`, …). */
  private parseDaListEntries(raw: URLSearchParams): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const [key, value] of raw.entries()) {
      if (!value.trim()) continue;
      if (/^list\d+$/i.test(key)) {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    if (names.length > 0) return names;
    for (const [key, value] of raw.entries()) {
      if (!value.trim()) continue;
      if (['error', 'text', 'details', 'success'].includes(key)) continue;
      if (/^name\d+$/i.test(key) || /^database\d+$/i.test(key)) {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    return names;
  }

  private parseDaBackupFileRows(raw: URLSearchParams): Array<{ id: string; fileName: string }> {
    const rows: Array<{ id: string; fileName: string }> = [];
    const seen = new Set<string>();
    for (const [key, value] of raw.entries()) {
      const fileName = value.trim();
      if (!fileName) continue;
      if (['error', 'text', 'details', 'success', 'domain'].includes(key)) continue;
      const isList = /^list\d+$/i.test(key);
      const isArchive =
        /^file\d+$/i.test(key) && /\.(tar|gz|tgz|zip)/i.test(fileName);
      if (!isList && !isArchive) continue;
      if (seen.has(fileName)) continue;
      seen.add(fileName);
      rows.push({ id: key, fileName });
    }
    return rows;
  }

  /** Obsługa odpowiedzi CMD_API_* jako tekstu key=value lub JSON z polem `error`. */
  private interpretDaPostResponse(data: unknown): void {
    if (data == null) return;
    if (typeof data === 'string') {
      const p = new URLSearchParams(data);
      const err = p.get('error');
      if (err && err !== '0') {
        throw new BadRequestException(p.get('text') ?? p.get('details') ?? 'DirectAdmin error');
      }
      return;
    }
    if (typeof data === 'object' && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if ('error' in o && o.error !== undefined) {
        const err = o.error;
        if (String(err) !== '0' && String(err) !== 'false') {
          throw new BadRequestException(
            String(o.text ?? o.details ?? o.message ?? 'DirectAdmin error'),
          );
        }
      }
    }
  }

  private async daFormForSubscription(
    subscriptionId: string,
    userId: string,
    path: string,
    form: Record<string, string>,
    options?: { timeoutMs?: number },
  ): Promise<URLSearchParams> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.id) throw new BadRequestException('Subscription has no hosting account yet');
    // SEC-2: blokuj mutacje na koncie zawieszonym/usuniętym (PROVISIONING dozwolony,
    // bo provisioning wykonuje operacje przed przejściem w ACTIVE). Odczyty
    // (daGetForSubscription) celowo nie są tu blokowane.
    if (sub.account.status === 'SUSPENDED' || sub.account.status === 'DELETED') {
      throw new BadRequestException(
        'Konto hostingowe jest zawieszone — operacja niedostępna. Skontaktuj się z pomocą.',
      );
    }
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    const axiosClient = (client as unknown as { client?: { post: Function } }).client;
    if (!axiosClient) throw new BadRequestException('DirectAdmin client is not available');
    const body = new URLSearchParams({ ...form, api: 'yes' }).toString();
    const response = await axiosClient.post(path, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: options?.timeoutMs ?? 15_000,
    });
    const raw = response?.data;
    this.interpretDaPostResponse(raw);
    if (typeof raw === 'string') {
      return this.parseKvPayload(raw);
    }
    return new URLSearchParams();
  }

  /**
   * Dane dostępowe usługi dla panelu klienta: IP węzła, host FTP/poczty, SSH,
   * serwery DNS (NS węzła → platforma) oraz liczniki użycia/limity konta DA
   * (CMD_API_SHOW_USER_USAGE + CMD_API_SHOW_USER_CONFIG).
   */
  async getConnectionInfo(
    subscriptionId: string,
    userId: string,
  ): Promise<ServiceConnectionInfoDto> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');

    const account = sub.account;
    const server = account?.server ?? null;
    const ipv4 = server?.ipAddress ?? null;
    const host = server?.hostname || ipv4;

    const nameservers = server
      ? await this.resolveNameserversForServer(server)
      : [];

    const info: ServiceConnectionInfoDto = {
      ipv4,
      ftpHost: host,
      mailHost: host,
      sshEnabled: null,
      sshHost: host,
      sshPort: null,
      nameservers,
      diskMb: emptyMetric(),
      bandwidthMb: emptyMetric(),
      emails: emptyMetric(),
      ftpAccounts: emptyMetric(),
      databases: emptyMetric(),
      inodes: emptyMetric(),
      fetchError: null,
    };

    if (!account?.id) {
      info.fetchError = 'Konto hostingowe nie jest jeszcze gotowe.';
      return info;
    }

    try {
      const client = await this.getClientForHostingAccount(account.id, userId);
      const axiosClient = (client as unknown as { client?: { get: Function } }).client;
      if (!axiosClient) throw new BadRequestException('DirectAdmin client is not available');
      const [usageRes, configRes] = await Promise.all([
        axiosClient.get('/CMD_API_SHOW_USER_USAGE', { timeout: 15_000 }),
        axiosClient.get('/CMD_API_SHOW_USER_CONFIG', { timeout: 15_000 }),
      ]);
      const usage = this.parseKvPayload(String(usageRes?.data ?? ''));
      const config = this.parseKvPayload(String(configRes?.data ?? ''));

      info.sshEnabled = parseDaBool(config.get('ssh'));
      if (info.sshEnabled) info.sshPort = 22;
      info.diskMb = daMetric(usage.get('quota'), config.get('quota'));
      info.bandwidthMb = daMetric(usage.get('bandwidth'), config.get('bandwidth'));
      info.emails = daMetric(usage.get('nemails'), config.get('nemails'));
      info.ftpAccounts = daMetric(usage.get('nftp'), config.get('nftp'));
      info.databases = daMetric(usage.get('nmysql'), config.get('nmysql'));
      info.inodes = daMetric(usage.get('inode'), config.get('inode'));
    } catch (err) {
      info.fetchError = err instanceof Error ? err.message : String(err);
    }
    return info;
  }

  /** Mirror of ServersService.resolveNameservers without the module cycle. */
  private async resolveNameserversForServer(server: {
    ns1: string | null;
    ns2: string | null;
    ns3: string | null;
  }): Promise<string[]> {
    const nodeNs = [server.ns1, server.ns2, server.ns3].map((v) => (v ?? '').trim());
    if (nodeNs[0] && nodeNs[1]) {
      return nodeNs.filter(Boolean);
    }
    const platform = await this.platformSettings.getHostingNameservers();
    return [platform.ns1, platform.ns2, platform.ns3].filter(Boolean);
  }

  private async assertDomainOnSubscription(
    subscriptionId: string,
    userId: string,
    domain: string,
  ) {
    const listing = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    if (listing.fetchError) {
      throw new BadRequestException(listing.fetchError);
    }
    const ok = listing.domains.some((d) => d.name.toLowerCase() === domain.trim().toLowerCase());
    if (!ok) {
      throw new BadRequestException('Ta domena nie jest przypisana do konta DirectAdmin tej usługi.');
    }
  }

  /**
   * Prośba o certyfikat Let's Encrypt (HTTP-01 przez DirectAdmin).
   * Wymaga włączonego Let's Encrypt po stronie serwera DA.
   */
  async requestLetsEncryptCertificate(
    subscriptionId: string,
    userId: string,
    input: { domain: string; includeWww?: boolean; wildcard?: boolean },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);

    // Wildcard (*.domena) wymaga walidacji DNS-01 — DA robi to automatycznie,
    // gdy strefa DNS domeny jest hostowana na tym węźle. HTTP-01 nie obsługuje
    // wildcardów, dlatego przy wildcard=yes DA używa DNS-01.
    const wildcard = input.wildcard === true;
    const form: Record<string, string> = {
      action: 'save',
      type: 'create',
      request: 'letsencrypt',
      domain,
      name: wildcard ? `${domain},*.${domain}` : domain,
      submit: 'Save',
      background: 'auto',
      wildcard: wildcard ? 'yes' : 'no',
      keysize: 'secp384r1',
      encryption: 'sha256',
      le_select0: domain,
    };
    if (wildcard) {
      // Pokryj apex + wszystkie subdomeny.
      form.le_select1 = `*.${domain}`;
    } else if (input.includeWww) {
      form.le_select1 = `www.${domain}`;
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SSL', form, { timeoutMs: 180_000 });
    return { ok: true as const };
  }

  /**
   * Wklejenie własnego certyfikatu (PEM) + klucza prywatnego; opcjonalnie łańcuch CA.
   * Odpowiada opcji „wklej certyfikat” w DirectAdmin.
   */
  async pasteCustomSslCertificate(
    subscriptionId: string,
    userId: string,
    input: { domain: string; certificate: string; privateKey: string; caBundle?: string },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    const certificate = input.certificate.trim();
    const privateKey = input.privateKey.trim();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    if (!certificate || !privateKey) {
      throw new BadRequestException('Certyfikat i klucz prywatny są wymagane.');
    }
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);

    const form: Record<string, string> = {
      action: 'save',
      type: 'paste',
      domain,
      certificate,
      key: privateKey,
      submit: 'Save',
    };
    const ca = input.caBundle?.trim();
    if (ca) {
      form.cacert = ca;
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SSL', form, { timeoutMs: 60_000 });
    return { ok: true as const };
  }

  async listHostingDnsRecords(
    subscriptionId: string,
    userId: string,
    domain?: string,
  ): Promise<{
    domain: string | null;
    records: Array<{ id: string; name: string; type: string; value: string; ttl: number | null }>;
    fetchError: string | null;
  }> {
    const domains = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const effectiveDomain = domain ?? domains.primaryDomain ?? domains.domains[0]?.name ?? null;
    if (!effectiveDomain) return { domain: null, records: [], fetchError: null };
    try {
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DNS_CONTROL', {
        action: 'select',
        domain: effectiveDomain,
      });
      const records: Array<{ id: string; name: string; type: string; value: string; ttl: number | null }> = [];
      for (const [k, v] of raw.entries()) {
        if (!/^name\d+$/i.test(k)) continue;
        const idx = k.replace(/\D/g, '');
        const name = v;
        const type = raw.get(`type${idx}`) ?? '';
        const value = raw.get(`value${idx}`) ?? '';
        const ttlRaw = raw.get(`ttl${idx}`);
        records.push({
          id: `${name}:${type}:${value}:${idx}`,
          name,
          type,
          value,
          ttl: ttlRaw ? Number(ttlRaw) : null,
        });
      }
      return { domain: effectiveDomain, records, fetchError: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingDnsRecords sub=${subscriptionId}: ${msg}`);
      return { domain: effectiveDomain, records: [], fetchError: msg };
    }
  }

  async createHostingDnsRecord(
    subscriptionId: string,
    userId: string,
    input: { domain: string; name: string; type: string; value: string; ttl?: number },
  ) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DNS_CONTROL', {
      action: 'add',
      domain: input.domain,
      name: input.name,
      type: input.type,
      value: input.value,
      ttl: String(input.ttl ?? 3600),
    });
    return { ok: true as const };
  }

  async deleteHostingDnsRecord(
    subscriptionId: string,
    userId: string,
    input: { domain: string; name: string; type: string; value: string },
  ) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DNS_CONTROL', {
      action: 'delete',
      domain: input.domain,
      name: input.name,
      type: input.type,
      value: input.value,
    });
    return { ok: true as const };
  }

  /** Primary domain of the account behind a subscription (for DA calls that
   *  require a `domain` param, e.g. CMD_API_FTP). */
  private async accountDomainForSubscription(subscriptionId: string, userId: string): Promise<string> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { select: { domain: true } } },
    });
    if (!sub?.account?.domain) {
      throw new BadRequestException('Subscription has no hosting account yet');
    }
    return sub.account.domain;
  }

  async listHostingFtpAccounts(subscriptionId: string, userId: string) {
    try {
      const domain = await this.accountDomainForSubscription(subscriptionId, userId);
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
        action: 'list',
        domain,
      });
      const rows: Array<{ id: string; username: string; path: string; suspended: boolean }> = [];
      for (const [k, v] of raw.entries()) {
        if (!/^user\d+$/i.test(k)) continue;
        const idx = k.replace(/\D/g, '');
        rows.push({
          id: `${v}:${idx}`,
          username: v,
          path: raw.get(`path${idx}`) ?? '/',
          suspended: (raw.get(`suspended${idx}`) ?? '0') === '1',
        });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { rows: [], fetchError: msg };
    }
  }

  async createHostingFtpAccount(
    subscriptionId: string,
    userId: string,
    input: { username: string; password: string; directory?: string },
  ) {
    const domain = await this.accountDomainForSubscription(subscriptionId, userId);
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
      action: 'create',
      user: input.username,
      passwd: input.password,
      passwd2: input.password,
      domain,
      path: input.directory ?? '/',
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FTP_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, username: input.username, domain },
    });
    return { ok: true as const };
  }

  async deleteHostingFtpAccount(subscriptionId: string, userId: string, username: string) {
    const domain = await this.accountDomainForSubscription(subscriptionId, userId);
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
      action: 'delete',
      domain,
      user: username,
      'select0': username,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_FTP_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, username, domain },
    });
    return { ok: true as const };
  }

  async listHostingEmailAccounts(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      return { rows: [], fetchError: null as string | null };
    }
    if (!sub.account.daPasswordEnc) {
      return {
        rows: [],
        fetchError:
          'Brak zapisanego dostępu do DirectAdmin dla tego konta (provisioningu).',
      };
    }
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) {
      return { rows: [], fetchError: 'Brak domeny dla konta hostingowego.' };
    }
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const accounts = await client.listEmailAccounts(domain, {
        accountUsername: sub.account.daUsername,
      });
      const rows = accounts.map((box) => {
        const email = box.localPart.includes('@')
          ? box.localPart
          : `${box.localPart}@${domain}`;
        return {
          id: email,
          email,
          quotaMb: box.quotaMb,
        };
      });
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingEmailAccounts sub=${subscriptionId}: ${msg}`);
      return { rows: [], fetchError: msg };
    }
  }

  async createHostingEmailAccount(
    subscriptionId: string,
    userId: string,
    input: { email: string; password: string; quotaMb?: number },
  ) {
    const [user, domain] = input.email.split('@');
    if (!user || !domain) throw new BadRequestException('Email must be in user@domain format');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_POP', {
      action: 'create',
      user,
      domain,
      passwd: input.password,
      passwd2: input.password,
      quota: String(input.quotaMb ?? 1024),
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_EMAIL_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, email: input.email },
    });
    return { ok: true as const };
  }

  async deleteHostingEmailAccount(subscriptionId: string, userId: string, email: string) {
    const [user, domain] = email.split('@');
    if (!user || !domain) throw new BadRequestException('Email must be in user@domain format');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_POP', {
      action: 'delete',
      user,
      domain,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_EMAIL_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, email },
    });
    return { ok: true as const };
  }

  async changeHostingEmailPassword(
    subscriptionId: string,
    userId: string,
    input: { email: string; password: string },
  ) {
    const [user, domain] = input.email.split('@');
    if (!user || !domain) throw new BadRequestException('Email must be in user@domain format');
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Hasło skrzynki musi mieć co najmniej 8 znaków.');
    }
    // DA CMD_API_POP action=modify wymaga quota — pobieramy bieżącą, by jej nie wyzerować.
    let quota = '1024';
    try {
      const list = await this.listHostingEmailAccounts(subscriptionId, userId);
      const box = list.rows.find((r) => r.email === input.email);
      if (box && typeof box.quotaMb === 'number' && box.quotaMb >= 0) {
        quota = String(box.quotaMb);
      }
    } catch {
      // brak listy → użyj domyślnej; modyfikacja hasła i tak ma priorytet
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_POP', {
      action: 'modify',
      user,
      domain,
      passwd: input.password,
      passwd2: input.password,
      quota,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_EMAIL_PASSWORD_CHANGED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, email: input.email },
    });
    return { ok: true as const };
  }

  /* ===================== Poczta: forwardery (aliasy) ===================== */
  async listHostingEmailForwarders(subscriptionId: string, userId: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) return { rows: [], fetchError: 'Brak domeny dla konta hostingowego.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_FORWARDERS', { domain });
      const meta = new Set(['error', 'text', 'details', 'message', 'result']);
      const rows: Array<{ id: string; name: string; email: string; destinations: string[] }> = [];
      for (const [k, v] of raw.entries()) {
        if (meta.has(k) || !k) continue;
        const destinations = String(v).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
        rows.push({ id: k, name: k, email: `${k}@${domain}`, destinations });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingEmailForwarders sub=${subscriptionId}: ${msg}`);
      return { rows: [], fetchError: msg };
    }
  }

  async createHostingEmailForward(
    subscriptionId: string,
    userId: string,
    input: { name: string; destinations: string },
  ) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const name = (input.name || '').trim().toLowerCase().replace(/@.*/, '');
    if (!/^[a-z0-9._-]+$/.test(name)) throw new BadRequestException('Nieprawidłowa nazwa aliasu (lewa część przed @).');
    const dests = (input.destinations || '')
      .split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
    if (dests.length === 0) throw new BadRequestException('Podaj co najmniej jeden adres docelowy.');
    for (const d of dests) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d)) throw new BadRequestException(`Nieprawidłowy adres docelowy: ${d}`);
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_FORWARDERS', {
      action: 'create',
      domain,
      user: name,
      email: dests.join(','),
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_EMAIL_FORWARD_CREATED,
      userId, actorUserId: userId,
      details: { subscriptionId, forward: `${name}@${domain}`, destinations: dests },
    });
    return { ok: true as const };
  }

  async deleteHostingEmailForward(subscriptionId: string, userId: string, name: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const local = (name || '').trim().toLowerCase().replace(/@.*/, '');
    if (!local) throw new BadRequestException('Brak nazwy aliasu do usunięcia.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_FORWARDERS', {
      action: 'delete',
      domain,
      select0: local,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_EMAIL_FORWARD_DELETED,
      userId, actorUserId: userId,
      details: { subscriptionId, forward: `${local}@${domain}` },
    });
    return { ok: true as const };
  }

  /* ===================== Poczta: autorespondery ===================== */
  async listHostingAutoresponders(subscriptionId: string, userId: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) return { rows: [], fetchError: 'Brak domeny dla konta hostingowego.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_AUTORESPONDER', { domain });
      const meta = new Set(['error', 'text', 'details', 'message', 'result']);
      const rows: Array<{ id: string; name: string; email: string; cc: string }> = [];
      for (const [k, v] of raw.entries()) {
        if (meta.has(k) || !k) continue;
        rows.push({ id: k, name: k, email: `${k}@${domain}`, cc: String(v ?? '') });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingAutoresponders sub=${subscriptionId}: ${msg}`);
      return { rows: [], fetchError: msg };
    }
  }

  async setHostingAutoresponder(
    subscriptionId: string,
    userId: string,
    input: { name: string; text: string; cc?: string },
  ) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const name = (input.name || '').trim().toLowerCase().replace(/@.*/, '');
    if (!/^[a-z0-9._-]+$/.test(name)) throw new BadRequestException('Nieprawidłowa nazwa skrzynki autorespondera.');
    const text = (input.text || '').trim();
    if (!text) throw new BadRequestException('Treść autorespondera nie może być pusta.');
    // create gdy nie istnieje, w przeciwnym razie modify (DA rozróżnia akcje)
    let action = 'create';
    try {
      const existing = await this.listHostingAutoresponders(subscriptionId, userId);
      if (existing.rows.some((r) => r.name === name)) action = 'modify';
    } catch { /* domyślnie create */ }
    // DA: cc=ON/OFF + email=<adres kopii> (nie adres bezpośrednio w cc).
    const form: Record<string, string> = { action, domain, user: name, text };
    if (input.cc && input.cc.trim()) { form.cc = 'ON'; form.email = input.cc.trim(); }
    else { form.cc = 'OFF'; }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_AUTORESPONDER', form);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_AUTORESPONDER_SET,
      userId, actorUserId: userId,
      details: { subscriptionId, mailbox: `${name}@${domain}`, mode: action },
    });
    return { ok: true as const };
  }

  async deleteHostingAutoresponder(subscriptionId: string, userId: string, name: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const local = (name || '').trim().toLowerCase().replace(/@.*/, '');
    if (!local) throw new BadRequestException('Brak nazwy skrzynki autorespondera.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_AUTORESPONDER', {
      action: 'delete',
      domain,
      select0: local,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_AUTORESPONDER_DELETED,
      userId, actorUserId: userId,
      details: { subscriptionId, mailbox: `${local}@${domain}` },
    });
    return { ok: true as const };
  }

  /* ===================== Narzędzia WWW (.htaccess) =====================
   * PANEL-2 (przekierowania, ochrona katalogu) + PANEL-4 (antyhotlink, blokada IP).
   * Reguły zapisywane do Verris-zarządzanego bloku w public_html/.htaccess,
   * a stan trzymany w public_html/.verris-webtools.json (źródło prawdy dla UI).
   * Wszystko realnie na koncie klienta — bez mocków. */
  private readonly WT_STATE_DIR = 'public_html';
  private readonly WT_STATE_FILE = '.verris-webtools.json';
  private readonly WT_BEGIN = '# BEGIN VERRIS WEBTOOLS (zarządzane przez panel — nie edytuj ręcznie)';
  private readonly WT_END = '# END VERRIS WEBTOOLS';

  private async readAccountTextFile(client: DirectAdminClient, path: string): Promise<string> {
    try {
      const buf = await client.downloadFile(path);
      return buf.toString('utf8');
    } catch {
      return '';
    }
  }

  private spliceManagedBlock(existing: string, body: string | null): string {
    const begin = existing.indexOf(this.WT_BEGIN);
    let base = existing;
    if (begin !== -1) {
      const end = existing.indexOf(this.WT_END, begin);
      if (end !== -1) {
        base = (existing.slice(0, begin) + existing.slice(end + this.WT_END.length)).replace(/\n{3,}/g, '\n\n').trim();
      }
    }
    if (!body || !body.trim()) return base ? base + '\n' : '';
    const block = `${this.WT_BEGIN}\n${body.trim()}\n${this.WT_END}`;
    return (block + (base ? '\n\n' + base : '') + '\n');
  }

  private renderWebToolsHtaccess(state: WebToolsState, domain: string): string {
    const lines: string[] = [];
    const esc = (s: string) => s.replace(/\./g, '\\.');
    // Reguły rewrite (HTTPS / www) muszą iść przed regułami blokującymi.
    const needsRewrite = state.forceHttps || (state.wwwMode && state.wwwMode !== 'none') || state.hotlink?.enabled;
    if (needsRewrite) lines.push('RewriteEngine On');
    if (state.wwwMode === 'nonwww') {
      lines.push('RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]');
      lines.push('RewriteRule ^ %{REQUEST_SCHEME}://%1%{REQUEST_URI} [L,R=301]');
    } else if (state.wwwMode === 'www') {
      lines.push('RewriteCond %{HTTP_HOST} !^www\\. [NC]');
      lines.push('RewriteCond %{HTTP_HOST} !^[0-9.]+$');
      lines.push('RewriteRule ^ %{REQUEST_SCHEME}://www.%{HTTP_HOST}%{REQUEST_URI} [L,R=301]');
    }
    if (state.forceHttps) {
      lines.push('RewriteCond %{HTTPS} off');
      lines.push('RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]');
    }
    for (const r of state.redirects ?? []) {
      if (!r.from || !r.to) continue;
      const from = r.from.startsWith('/') ? r.from : `/${r.from}`;
      lines.push(`Redirect ${r.type === '302' ? '302' : '301'} ${from} ${r.to}`);
    }
    if (state.hotlink?.enabled) {
      const exts = (state.hotlink.extensions || 'jpg,jpeg,png,gif,webp,svg,bmp')
        .split(/[,\s]+/).map((x) => x.replace(/[^a-z0-9]/gi, '')).filter(Boolean).join('|') || 'jpg|jpeg|png|gif|webp';
      lines.push('RewriteCond %{HTTP_REFERER} !^$');
      lines.push(`RewriteCond %{HTTP_REFERER} !^https?://([^/]+\\.)?${esc(domain)}(/|$) [NC]`);
      for (const a of state.hotlink.allow ?? []) {
        const host = a.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (host) lines.push(`RewriteCond %{HTTP_REFERER} !^https?://([^/]+\\.)?${esc(host)}(/|$) [NC]`);
      }
      lines.push(`RewriteRule \\.(${exts})$ - [F,NC]`);
    }
    const ips = (state.blockedIps ?? []).map((x) => x.trim()).filter(Boolean);
    if (ips.length) {
      lines.push('<RequireAll>');
      lines.push('Require all granted');
      for (const ip of ips) lines.push(`Require not ip ${ip}`);
      lines.push('</RequireAll>');
    }
    return lines.join('\n');
  }

  private defaultWebToolsState(): WebToolsState {
    return { redirects: [], hotlink: { enabled: false, extensions: 'jpg,jpeg,png,gif,webp,svg', allow: [] }, blockedIps: [], protectedDirs: [], forceHttps: false, wwwMode: 'none' };
  }

  async getHostingWebTools(subscriptionId: string, userId: string): Promise<{ state: WebToolsState; fetchError: string | null }> {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) return { state: this.defaultWebToolsState(), fetchError: 'Brak konta hostingowego.' };
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const raw = await this.readAccountTextFile(client, `${this.WT_STATE_DIR}/${this.WT_STATE_FILE}`);
      if (!raw.trim()) return { state: this.defaultWebToolsState(), fetchError: null };
      const parsed = JSON.parse(raw) as Partial<WebToolsState>;
      return {
        state: {
          redirects: Array.isArray(parsed.redirects) ? parsed.redirects : [],
          hotlink: parsed.hotlink ?? this.defaultWebToolsState().hotlink,
          blockedIps: Array.isArray(parsed.blockedIps) ? parsed.blockedIps : [],
          protectedDirs: Array.isArray(parsed.protectedDirs) ? parsed.protectedDirs : [],
          forceHttps: Boolean(parsed.forceHttps),
          wwwMode: parsed.wwwMode === 'www' || parsed.wwwMode === 'nonwww' ? parsed.wwwMode : 'none',
        },
        fetchError: null,
      };
    } catch (err) {
      return { state: this.defaultWebToolsState(), fetchError: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Zapisuje stan (redirecty + hotlink + blokada IP) i regeneruje blok .htaccess. */
  async saveHostingWebTools(subscriptionId: string, userId: string, input: Partial<WebToolsState>): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) throw new BadRequestException('Brak konta hostingowego.');
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    // walidacja
    const redirects = (input.redirects ?? []).slice(0, 100).map((r) => ({
      from: String(r.from || '').trim(),
      to: String(r.to || '').trim(),
      type: r.type === '302' ? '302' as const : '301' as const,
    })).filter((r) => r.from && r.to);
    for (const r of redirects) {
      if (!/^\/[\w\-./]*$/.test(r.from)) throw new BadRequestException(`Nieprawidłowa ścieżka źródłowa: ${r.from}`);
      if (!/^(https?:\/\/|\/)[\w\-./:?=&#%~+@.]*$/i.test(r.to)) throw new BadRequestException(`Nieprawidłowy cel: ${r.to}`);
    }
    const ipRe = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-f:]+(\/\d{1,3})?$/i;
    const blockedIps = (input.blockedIps ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 500);
    for (const ip of blockedIps) if (!ipRe.test(ip)) throw new BadRequestException(`Nieprawidłowy adres IP: ${ip}`);
    const current = await this.getHostingWebTools(subscriptionId, userId);
    const state: WebToolsState = {
      redirects,
      hotlink: {
        enabled: Boolean(input.hotlink?.enabled),
        extensions: String(input.hotlink?.extensions ?? 'jpg,jpeg,png,gif,webp,svg').slice(0, 200),
        allow: (input.hotlink?.allow ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 50),
      },
      blockedIps,
      protectedDirs: current.state.protectedDirs ?? [],
      forceHttps: Boolean(input.forceHttps),
      wwwMode: input.wwwMode === 'www' || input.wwwMode === 'nonwww' ? input.wwwMode : 'none',
    };
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    const existing = await this.readAccountTextFile(client, `${this.WT_STATE_DIR}/.htaccess`);
    const merged = this.spliceManagedBlock(existing, this.renderWebToolsHtaccess(state, domain));
    await client.writeFile(this.WT_STATE_DIR, '.htaccess', merged);
    await client.writeFile(this.WT_STATE_DIR, this.WT_STATE_FILE, JSON.stringify(state, null, 2));
    await this.audit.record({
      action: HostingResourceActions.HOSTING_HTACCESS_RULES_SET,
      userId, actorUserId: userId,
      details: { subscriptionId, redirects: redirects.length, hotlink: state.hotlink.enabled, blockedIps: blockedIps.length },
    });
    return { ok: true as const };
  }

  /** Ochrona katalogu hasłem: .htpasswd (bcrypt) + .htaccess Basic Auth w wybranym katalogu. */
  async setHostingDirectoryProtection(
    subscriptionId: string,
    userId: string,
    input: { dir: string; realm?: string; user: string; password: string },
  ): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id || !sub.account.daUsername) throw new BadRequestException('Brak konta hostingowego.');
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const rel = String(input.dir || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
    if (rel.includes('..') || /[^a-zA-Z0-9 _./-]/.test(rel)) throw new BadRequestException('Nieprawidłowa ścieżka katalogu.');
    const username = String(input.user || '').trim();
    if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) throw new BadRequestException('Nieprawidłowa nazwa użytkownika.');
    if (!input.password || input.password.length < 6) throw new BadRequestException('Hasło musi mieć co najmniej 6 znaków.');
    const realm = (input.realm || 'Obszar chroniony').replace(/["\r\n]/g, '').slice(0, 80);
    const dir = rel ? `${this.WT_STATE_DIR}/${rel}` : this.WT_STATE_DIR;
    const absHtpasswd = `/home/${sub.account.daUsername}/domains/${domain}/public_html/${rel ? rel + '/' : ''}.htpasswd`;
    const hash = bcrypt.hashSync(input.password, 10).replace(/^\$2[ab]\$/, '$2y$');
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    await client.writeFile(dir, '.htpasswd', `${username}:${hash}\n`);
    const authBlock = ['AuthType Basic', `AuthName "${realm}"`, `AuthUserFile ${absHtpasswd}`, 'Require valid-user'].join('\n');
    const existing = await this.readAccountTextFile(client, `${dir}/.htaccess`);
    const merged = this.spliceManagedBlock(existing, authBlock);
    await client.writeFile(dir, '.htaccess', merged);
    // zapamiętaj chroniony katalog w stanie
    const cur = await this.getHostingWebTools(subscriptionId, userId);
    const protectedDirs = Array.from(new Set([...(cur.state.protectedDirs ?? []), rel || '/']));
    await client.writeFile(this.WT_STATE_DIR, this.WT_STATE_FILE, JSON.stringify({ ...cur.state, protectedDirs }, null, 2));
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DIRPROTECT_SET,
      userId, actorUserId: userId, details: { subscriptionId, dir: rel || '/' },
    });
    return { ok: true as const };
  }

  async removeHostingDirectoryProtection(subscriptionId: string, userId: string, dirRaw: string): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) throw new BadRequestException('Brak konta hostingowego.');
    const rel = String(dirRaw || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
    if (rel.includes('..') || /[^a-zA-Z0-9 _./-]/.test(rel)) throw new BadRequestException('Nieprawidłowa ścieżka katalogu.');
    const dir = rel ? `${this.WT_STATE_DIR}/${rel}` : this.WT_STATE_DIR;
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    const existing = await this.readAccountTextFile(client, `${dir}/.htaccess`);
    await client.writeFile(dir, '.htaccess', this.spliceManagedBlock(existing, null));
    const cur = await this.getHostingWebTools(subscriptionId, userId);
    const protectedDirs = (cur.state.protectedDirs ?? []).filter((d) => d !== (rel || '/'));
    await client.writeFile(this.WT_STATE_DIR, this.WT_STATE_FILE, JSON.stringify({ ...cur.state, protectedDirs }, null, 2));
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DIRPROTECT_DELETED,
      userId, actorUserId: userId, details: { subscriptionId, dir: rel || '/' },
    });
    return { ok: true as const };
  }

  /* ===================== PANEL-3: domeny dodatkowe na koncie ===================== */
  async listHostingAdditionalDomains(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) return { rows: [], primary: null as string | null, fetchError: 'Brak konta hostingowego.' };
    try {
      const primary = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const domains = await client.getDomains();
      const rows = domains.map((d) => ({ domain: d, isPrimary: d === primary }));
      return { rows, primary, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingAdditionalDomains sub=${subscriptionId}: ${msg}`);
      return { rows: [], primary: null as string | null, fetchError: msg };
    }
  }

  async createHostingAdditionalDomain(subscriptionId: string, userId: string, input: { domain: string }) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) throw new BadRequestException('Brak konta hostingowego.');
    const domain = String(input.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new BadRequestException('Nieprawidłowa nazwa domeny.');
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    await client.createDomain(domain);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_ADDON_DOMAIN_CREATED,
      userId, actorUserId: userId, details: { subscriptionId, domain },
    });
    return { ok: true as const };
  }

  async deleteHostingAdditionalDomain(subscriptionId: string, userId: string, domainRaw: string) {
    const domain = String(domainRaw || '').trim().toLowerCase();
    if (!domain) throw new BadRequestException('Brak domeny do usunięcia.');
    const primary = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (domain === primary) throw new BadRequestException('Nie można usunąć domeny głównej konta.');
    // DA: usuwanie domeny przez select0 + delete=yes + confirmed=yes (bez action).
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DOMAIN', {
      delete: 'yes',
      confirmed: 'yes',
      select0: domain,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_ADDON_DOMAIN_DELETED,
      userId, actorUserId: userId, details: { subscriptionId, domain },
    });
    return { ok: true as const };
  }

  /* ===================== PANEL-12: statystyki konta (transfer/dysk) ===================== */
  async getHostingAccountStats(subscriptionId: string, userId: string) {
    const num = (v: unknown) => {
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    // DA: '0' lub 'unlimited' = bez limitu.
    const lim = (v: unknown): number | null => {
      const s = String(v ?? '').trim().toLowerCase();
      if (!s || s === 'unlimited' || s === '0') return null;
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };
    try {
      const [usage, config] = await Promise.all([
        this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SHOW_USER_USAGE', {}),
        this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SHOW_USER_CONFIG', {}).catch(() => new URLSearchParams()),
      ]);
      return {
        bandwidth: { usedMb: num(usage.get('bandwidth')), limitMb: lim(config.get('bandwidth')) },
        disk: { usedMb: num(usage.get('quota')), limitMb: lim(config.get('quota')) },
        counts: {
          domains: Math.round(num(usage.get('vdomains'))),
          subdomains: Math.round(num(usage.get('nsubdomains'))),
          emails: Math.round(num(usage.get('nemails'))),
          databases: Math.round(num(usage.get('mysql'))),
          ftp: Math.round(num(usage.get('ftp'))),
        },
        fetchError: null as string | null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`getHostingAccountStats sub=${subscriptionId}: ${msg}`);
      return {
        bandwidth: { usedMb: 0, limitMb: null },
        disk: { usedMb: 0, limitMb: null },
        counts: { domains: 0, subdomains: 0, emails: 0, databases: 0, ftp: 0 },
        fetchError: msg,
      };
    }
  }

  /** PANEL-11b: retencja — zostaw `keep` najnowszych archiwów w /backups, usuń starsze. */
  async pruneHostingBackups(subscriptionId: string, userId: string, keep: number): Promise<number> {
    if (!keep || keep < 1) return 0;
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub?.account?.id) return 0;
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      const entries = await client.listDir('/backups').catch(() => []);
      const archives = entries
        .filter((e) => e.type === 'file' && /\.(tar\.gz|tgz|tar|zip)$/i.test(e.name))
        .sort((a, b) => {
          const ta = a.modified ? Date.parse(a.modified) : NaN;
          const tb = b.modified ? Date.parse(b.modified) : NaN;
          if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta; // najnowsze pierwsze
          return b.name.localeCompare(a.name); // fallback: po nazwie (zwykle z datą)
        });
      const toDelete = archives.slice(keep).map((e) => e.name);
      if (toDelete.length === 0) return 0;
      await client.deleteEntries('/backups', toDelete);
      this.logger.log(`Retencja backupów sub=${subscriptionId}: usunięto ${toDelete.length}, zostawiono ${keep}.`);
      return toDelete.length;
    } catch (err) {
      this.logger.warn(`pruneHostingBackups sub=${subscriptionId}: ${(err as Error).message}`);
      return 0;
    }
  }

  /* ===================== PANEL-8: catch-all e-mail ===================== */
  async getHostingCatchAll(subscriptionId: string, userId: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) return { value: '', mode: 'fail' as const, address: '', fetchError: 'Brak domeny dla konta hostingowego.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_CATCH_ALL', { domain });
      const value = (raw.get('value') ?? raw.get('catch') ?? '').trim();
      let mode: 'fail' | 'blackhole' | 'address' = 'fail';
      let address = '';
      if (value === ':blackhole:') mode = 'blackhole';
      else if (value && value !== ':fail:') { mode = 'address'; address = value; }
      return { value, mode, address, fetchError: null as string | null };
    } catch (err) {
      return { value: '', mode: 'fail' as const, address: '', fetchError: err instanceof Error ? err.message : String(err) };
    }
  }

  async setHostingCatchAll(subscriptionId: string, userId: string, input: { mode: 'fail' | 'blackhole' | 'address'; address?: string }) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    const form: Record<string, string> = { domain, update: 'Update' };
    if (input.mode === 'blackhole') form.catch = ':blackhole:';
    else if (input.mode === 'address') {
      const addr = String(input.address || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) throw new BadRequestException('Podaj prawidłowy adres docelowy catch-all.');
      form.catch = 'address';
      form.value = addr;
    } else form.catch = ':fail:';
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_EMAIL_CATCH_ALL', form);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_CATCHALL_SET,
      userId, actorUserId: userId, details: { subscriptionId, domain, mode: input.mode },
    });
    return { ok: true as const };
  }

  /* ===================== PANEL-9: filtr antyspam (SpamAssassin) ===================== */
  async getHostingSpamFilter(subscriptionId: string, userId: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) return { isOn: false, requiredScore: '5', subjectTag: '', fetchError: 'Brak domeny dla konta hostingowego.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SPAMASSASSIN', { domain });
      return {
        isOn: (raw.get('is_on') ?? '').toLowerCase() === 'yes',
        requiredScore: raw.get('required_score') ?? raw.get('required_hits') ?? '5',
        subjectTag: raw.get('subject_tag') ?? '',
        fetchError: null as string | null,
      };
    } catch (err) {
      return { isOn: false, requiredScore: '5', subjectTag: '', fetchError: err instanceof Error ? err.message : String(err) };
    }
  }

  async setHostingSpamFilter(subscriptionId: string, userId: string, input: { enabled: boolean; requiredScore?: string; subjectTag?: string }) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny dla konta hostingowego.');
    if (!input.enabled) {
      await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SPAMASSASSIN', { action: 'disable', domain });
    } else {
      // GET aktualne tokeny i nadpisz tylko wybrane — DA action=save oczekuje pełnego zestawu pól.
      const tokens: Record<string, string> = {};
      try {
        const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SPAMASSASSIN', { domain });
        for (const [k, v] of raw.entries()) tokens[k] = v;
      } catch { /* domyślne */ }
      const score = String(input.requiredScore ?? tokens.required_score ?? '5').replace(/[^0-9.]/g, '') || '5';
      const form: Record<string, string> = {
        action: 'save', domain,
        is_on: 'yes',
        required_score: score,
        report_safe: tokens.report_safe ?? '1',
        high_score: tokens.high_score ?? '',
        high_score_block: tokens.high_score_block ?? 'no',
        subject_tag: input.subjectTag ?? tokens.subject_tag ?? '***SPAM*** ',
        rewrite_subject: tokens.rewrite_subject ?? 'yes',
        where: tokens.where ?? 'INBOX',
      };
      await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SPAMASSASSIN', form);
    }
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SPAMFILTER_SET,
      userId, actorUserId: userId, details: { subscriptionId, domain, enabled: input.enabled },
    });
    return { ok: true as const };
  }

  /* ===================== PANEL-10: zdalny dostęp MySQL (access hosts) ===================== */
  async listHostingDbAccessHosts(subscriptionId: string, userId: string, db: string) {
    const dbName = String(db || '').trim();
    if (!dbName) return { hosts: [] as string[], fetchError: 'Brak nazwy bazy.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_DATABASES', { action: 'accesshosts', db: dbName });
      const meta = new Set(['error', 'text', 'details', 'message', 'result']);
      const hosts: string[] = [];
      for (const [k, v] of raw.entries()) {
        if (meta.has(k)) continue;
        if (/^list\d+$/i.test(k) || k === 'host') hosts.push(v);
        else if (v && k.includes('.')) hosts.push(k);
      }
      return { hosts: Array.from(new Set(hosts.filter(Boolean))), fetchError: null as string | null };
    } catch (err) {
      return { hosts: [] as string[], fetchError: err instanceof Error ? err.message : String(err) };
    }
  }

  async addHostingDbAccessHost(subscriptionId: string, userId: string, input: { db: string; host: string }) {
    const dbName = String(input.db || '').trim();
    const host = String(input.host || '').trim();
    if (!dbName) throw new BadRequestException('Brak nazwy bazy.');
    if (!/^[a-zA-Z0-9._%-]+$/.test(host)) throw new BadRequestException('Nieprawidłowy host (dozwolone: IP, nazwa, % jako wildcard).');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DATABASES', {
      action: 'accesshosts', create: 'yes', db: dbName, host,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_ACCESSHOST_ADDED,
      userId, actorUserId: userId, details: { subscriptionId, db: dbName, host },
    });
    return { ok: true as const };
  }

  async deleteHostingDbAccessHost(subscriptionId: string, userId: string, input: { db: string; host: string }) {
    const dbName = String(input.db || '').trim();
    const host = String(input.host || '').trim();
    if (!dbName || !host) throw new BadRequestException('Brak bazy lub hosta.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DATABASES', {
      action: 'accesshosts', delete: 'yes', db: dbName, select0: host,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_ACCESSHOST_DELETED,
      userId, actorUserId: userId, details: { subscriptionId, db: dbName, host },
    });
    return { ok: true as const };
  }

  /* ===================== SPRINT-1a: użytkownicy baz MySQL ===================== */

  /** Resolves the subscription's hosting account and a DA client for it. */
  private async accountClientForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.id || !sub.account.daPasswordEnc) {
      throw new BadRequestException('Konto hostingowe nie jest jeszcze gotowe.');
    }
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    return { sub, account: sub.account, client };
  }

  /** Lista użytkowników przypisanych do bazy (pełne, prefiksowane nazwy). */
  async listHostingDbUsers(subscriptionId: string, userId: string, db: string) {
    const dbName = String(db || '').trim();
    if (!dbName) throw new BadRequestException('Brak nazwy bazy.');
    try {
      const { client } = await this.accountClientForSubscription(subscriptionId, userId);
      const users = await client.listDbUsers(dbName);
      return { users, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingDbUsers sub=${subscriptionId} db=${dbName}: ${msg}`);
      return { users: [] as string[], fetchError: msg };
    }
  }

  /** Dodaje dodatkowego użytkownika do istniejącej bazy. */
  async createHostingDbUser(
    subscriptionId: string,
    userId: string,
    input: { db: string; user: string; password: string },
  ): Promise<{ username: string }> {
    const dbName = String(input.db || '').trim();
    if (!dbName) throw new BadRequestException('Brak nazwy bazy.');
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(input.user || '')) {
      throw new BadRequestException('Nazwa użytkownika: 1–16 znaków (litery, cyfry, _).');
    }
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Hasło musi mieć co najmniej 8 znaków.');
    }
    const { account, client } = await this.accountClientForSubscription(subscriptionId, userId);
    const result = await client.createDbUser(dbName, input.user, input.password);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_USER_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, db: dbName, dbUser: result.username },
    });
    return result;
  }

  /** Usuwa użytkownika bazy (pełna, prefiksowana nazwa). */
  async deleteHostingDbUser(
    subscriptionId: string,
    userId: string,
    input: { db: string; user: string },
  ): Promise<{ ok: true }> {
    const dbName = String(input.db || '').trim();
    const dbUser = String(input.user || '').trim();
    if (!dbName || !dbUser) throw new BadRequestException('Brak bazy lub użytkownika.');
    const { account, client } = await this.accountClientForSubscription(subscriptionId, userId);
    await client.deleteDbUser(dbName, dbUser);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_USER_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, db: dbName, dbUser },
    });
    return { ok: true as const };
  }

  /** Zmienia hasło użytkownika bazy (pełna, prefiksowana nazwa). */
  async changeHostingDbUserPassword(
    subscriptionId: string,
    userId: string,
    input: { db: string; user: string; password: string },
  ): Promise<{ ok: true }> {
    const dbName = String(input.db || '').trim();
    const dbUser = String(input.user || '').trim();
    if (!dbName || !dbUser) throw new BadRequestException('Brak bazy lub użytkownika.');
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Hasło musi mieć co najmniej 8 znaków.');
    }
    const { account, client } = await this.accountClientForSubscription(subscriptionId, userId);
    await client.setDbUserPassword(dbName, dbUser, input.password);
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DB_USER_PASSWORD_CHANGED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, db: dbName, dbUser },
    });
    return { ok: true as const };
  }

  /* ===================== SPRINT-1c: auto-logowanie (one-time SSO URL) ===================== */

  /**
   * Tworzy jednorazowy adres auto-logowania do panelu hostingu (DA) dla konta
   * subskrypcji. `target` steruje miejscem docelowym po zalogowaniu:
   *  - `phpmyadmin` → SSO phpMyAdmin (`/CMD_PMA/`, wymaga one_click_pma_login=1 na węźle),
   *  - `webmail`    → lista skrzynek w Evolution (przycisk 1-klik webmaila),
   *  - `panel`      → pulpit panelu hostingu.
   * URL jest ważny 2 minuty i działa jeden raz; tworzenie jest audytowane.
   */
  async createHostingSsoUrl(
    subscriptionId: string,
    userId: string,
    target: 'phpmyadmin' | 'webmail' | 'panel',
  ): Promise<{ url: string }> {
    const redirects: Record<'phpmyadmin' | 'webmail' | 'panel', string> = {
      phpmyadmin: '/CMD_PMA/',
      webmail: '/evo/user/email/accounts',
      panel: '/',
    };
    const redirectUrl = redirects[target];
    if (!redirectUrl) throw new BadRequestException('Nieznany cel logowania.');
    const { account, client } = await this.accountClientForSubscription(subscriptionId, userId);
    const url = await client.createOneTimeLoginUrl({ redirectUrl, expiry: '2m' });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SSO_URL_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, accountId: account.id, target },
    });
    return { url };
  }

  /* ===================== FALA-2b: wersja PHP per domena ===================== */

  /** Sprawdza, że `domain` jest jedną z domen konta subskrypcji. */
  private async assertDomainOwnedBySubscription(
    subscriptionId: string,
    userId: string,
    domain: string,
  ): Promise<string> {
    const wanted = String(domain || '').trim().toLowerCase();
    if (!wanted) throw new BadRequestException('Brak domeny.');
    const res = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const names = res.domains.map((d) => d.name.toLowerCase());
    if (!names.includes(wanted)) {
      throw new BadRequestException('Domena nie należy do tej usługi.');
    }
    return wanted;
  }

  /**
   * Stan wyboru PHP per domena: mapa slotów (platform-setting `php.slotReleases`,
   * odpowiada phpN_release z options.conf CustomBuild) + best-effort odczyt
   * bieżącego slotu domeny z DA. Gdy odczyt się nie uda, `currentSlot=null`
   * („wg ustawienia konta") — sam zapis działa niezależnie.
   */
  async getHostingDomainPhp(subscriptionId: string, userId: string, domain: string) {
    const dom = await this.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    const slotReleases = await this.platformSettings.getPhpSlotReleases();
    let currentSlot: number | null = null;
    try {
      const raw = await this.daGetForSubscription(
        subscriptionId,
        userId,
        '/CMD_API_ADDITIONAL_DOMAINS',
        { action: 'view', domain: dom },
      );
      const sel = raw.get('php1_select');
      if (sel != null && /^\d+$/.test(sel)) currentSlot = Number(sel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`getHostingDomainPhp view sub=${subscriptionId} ${dom}: ${msg}`);
    }
    return {
      domain: dom,
      slotReleases,
      currentSlot,
      currentVersion:
        currentSlot != null && currentSlot >= 1 && currentSlot <= slotReleases.length
          ? slotReleases[currentSlot - 1]
          : null,
    };
  }

  /**
   * Ustawia wersję PHP dla pojedynczej domeny przez selektor DA
   * (`CMD_API_DOMAIN action=php_selector`, `php1_select=<slot>`); slot wynika
   * z mapy `php.slotReleases`. Działa obok per-kontowego CloudLinux Selectora
   * (PHP_APPLY) — wybór per domena ma pierwszeństwo dla vhostu.
   */
  async setHostingDomainPhp(
    subscriptionId: string,
    userId: string,
    input: { domain: string; version: string },
  ): Promise<{ ok: true; domain: string; version: string; slot: number }> {
    const dom = await this.assertDomainOwnedBySubscription(subscriptionId, userId, input.domain);
    const slotReleases = await this.platformSettings.getPhpSlotReleases();
    const version = String(input.version || '').trim();
    const slot = slotReleases.indexOf(version) + 1;
    if (slot === 0) {
      throw new BadRequestException(
        `Nieobsługiwana wersja PHP dla domeny. Dostępne: ${slotReleases.join(', ')}.`,
      );
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DOMAIN', {
      action: 'php_selector',
      save: 'yes',
      domain: dom,
      php1_select: String(slot),
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DOMAIN_PHP_SET,
      userId,
      actorUserId: userId,
      details: { subscriptionId, domain: dom, version, slot },
    });
    return { ok: true as const, domain: dom, version, slot };
  }

  /* ===================== FALA-2c: SSO admina do panelu DA węzła ===================== */

  /**
   * Jednorazowy adres logowania ADMINA do DirectAdmin węzła (ważny 2 minuty,
   * jedno użycie) + podpowiedź SSH. Tylko dla roli ADMIN — wywołanie audytowane.
   */
  async createNodeAdminSsoUrl(
    serverId: string,
    actorUserId: string,
  ): Promise<{ url: string; sshHost: string | null; sshCommand: string | null }> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    const client = await this.getClientForServer(serverId);
    const url = await client.createOneTimeLoginUrl({ redirectUrl: '/', expiry: '2m' });
    const sshHost = server.hostname ?? server.ipAddress ?? null;
    await this.audit.record({
      action: 'NODE_ADMIN_SSO_URL_CREATED',
      userId: actorUserId,
      actorUserId,
      details: { serverId, serverName: server.name ?? null },
    });
    return { url, sshHost, sshCommand: sshHost ? `ssh root@${sshHost}` : null };
  }

  /* ===================== PANEL-5: aliasy domeny (domain pointers) ===================== */
  async listHostingDomainPointers(subscriptionId: string, userId: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) return { rows: [], primary: null as string | null, fetchError: 'Brak domeny dla konta hostingowego.' };
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_DOMAIN_POINTER', { domain });
      const meta = new Set(['error', 'text', 'details', 'message', 'result']);
      const rows: Array<{ alias: string; type: string }> = [];
      for (const [k, v] of raw.entries()) {
        if (meta.has(k) || !k) continue;
        rows.push({ alias: k, type: String(v || 'alias') });
      }
      return { rows, primary: domain, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingDomainPointers sub=${subscriptionId}: ${msg}`);
      return { rows: [], primary: domain, fetchError: msg };
    }
  }

  async createHostingDomainPointer(subscriptionId: string, userId: string, input: { alias: string }) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny głównej konta.');
    const alias = String(input.alias || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(alias)) throw new BadRequestException('Nieprawidłowa nazwa aliasu domeny.');
    if (alias === domain) throw new BadRequestException('Alias nie może być tożsamy z domeną główną.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DOMAIN_POINTER', {
      action: 'add',
      domain,
      from: alias,
      alias: 'yes',
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DOMAIN_POINTER_CREATED,
      userId, actorUserId: userId, details: { subscriptionId, domain, alias },
    });
    return { ok: true as const };
  }

  async deleteHostingDomainPointer(subscriptionId: string, userId: string, aliasRaw: string) {
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) throw new BadRequestException('Brak domeny głównej konta.');
    const alias = String(aliasRaw || '').trim().toLowerCase();
    if (!alias) throw new BadRequestException('Brak aliasu do usunięcia.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DOMAIN_POINTER', {
      action: 'delete',
      domain,
      select0: alias,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_DOMAIN_POINTER_DELETED,
      userId, actorUserId: userId, details: { subscriptionId, domain, alias },
    });
    return { ok: true as const };
  }

  async listHostingCronJobs(subscriptionId: string, userId: string) {
    try {
      const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_CRON', {});
      const rows: Array<{ id: string; schedule: string; command: string }> = [];
      for (const [k, v] of raw.entries()) {
        if (!/^command\d+$/i.test(k)) continue;
        const idx = k.replace(/\D/g, '');
        const schedule = [
          raw.get(`minute${idx}`) ?? '*',
          raw.get(`hour${idx}`) ?? '*',
          raw.get(`day_of_month${idx}`) ?? '*',
          raw.get(`month${idx}`) ?? '*',
          raw.get(`day_of_week${idx}`) ?? '*',
        ].join(' ');
        rows.push({ id: idx, schedule, command: v });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { rows: [], fetchError: msg };
    }
  }

  async createHostingCronJob(
    subscriptionId: string,
    userId: string,
    input: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string; command: string },
  ) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_CRON', {
      action: 'create',
      minute: input.minute,
      hour: input.hour,
      day_of_month: input.dayOfMonth,
      month: input.month,
      day_of_week: input.dayOfWeek,
      command: input.command,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_CRON_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, command: input.command },
    });
    return { ok: true as const };
  }

  async deleteHostingCronJob(subscriptionId: string, userId: string, id: string) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_CRON', {
      action: 'delete',
      select0: id,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_CRON_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, cronId: id },
    });
    return { ok: true as const };
  }

  // ---------------------------------------------------------------------------
  // Staging — poddomena + opcjonalna baza (CMD_API_SUBDOMAINS / CMD_API_DATABASES)
  // ---------------------------------------------------------------------------

  /** GET — lista poddomen konta (potencjalne środowiska staging). */
  async listHostingStaging(
    subscriptionId: string,
    userId: string,
  ): Promise<HostingStagingResponseDto> {
    const domainsRes = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const domains = domainsRes.domains.map((d) => d.name);
    if (domainsRes.fetchError) {
      return {
        rows: [],
        domains,
        primaryDomain: domainsRes.primaryDomain,
        fetchError: domainsRes.fetchError,
      };
    }
    const rows: HostingStagingEnvDto[] = [];
    try {
      for (const domain of domains.slice(0, 25)) {
        const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
          domain,
        });
        for (const sub of parseDaSubdomainList(raw)) {
          rows.push({ id: `${sub}.${domain}`, subdomain: sub, domain, url: `https://${sub}.${domain}` });
        }
      }
      return { rows, domains, primaryDomain: domainsRes.primaryDomain, fetchError: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { rows, domains, primaryDomain: domainsRes.primaryDomain, fetchError: msg };
    }
  }

  async createHostingStaging(
    subscriptionId: string,
    userId: string,
    input: { domain: string; label?: string; withDatabase?: boolean },
  ): Promise<HostingStagingCreatedDto> {
    const domain = input.domain.trim();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);

    const label = (input.label?.trim() || 'staging').toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      throw new BadRequestException('Nazwa poddomeny: a-z, 0-9 i myślnik (maks. 32 znaki).');
    }

    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
      action: 'create',
      domain,
      subdomain: label,
    });

    let database: HostingStagingDatabaseDto | null = null;
    if (input.withDatabase) {
      const sub = await this.prisma.subscription.findFirst({
        where: { id: subscriptionId, userId },
        include: { account: true },
      });
      const daUsername = sub?.account?.daUsername;
      if (!daUsername) {
        throw new BadRequestException('Konto hostingowe nie ma jeszcze loginu DirectAdmin.');
      }
      const suffix = label.replace(/-/g, '').slice(0, 12) || 'staging';
      const password = generateDbPassword();
      await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_DATABASES', {
        action: 'create',
        name: suffix,
        user: suffix,
        passwd: password,
        passwd2: password,
      });
      database = {
        name: `${daUsername}_${suffix}`,
        user: `${daUsername}_${suffix}`,
        password,
      };
    }

    return {
      ok: true,
      env: { id: `${label}.${domain}`, subdomain: label, domain, url: `https://${label}.${domain}` },
      database,
    };
  }

  async deleteHostingStaging(
    subscriptionId: string,
    userId: string,
    input: { domain: string; subdomain: string },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    const subdomain = input.subdomain.trim();
    if (!domain || !subdomain) throw new BadRequestException('Domena i poddomena są wymagane.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
      action: 'delete',
      domain,
      select0: subdomain,
      contents: 'yes',
    });
    return { ok: true as const };
  }

  // ---------------------------------------------------------------------------
  // Subdomeny (ogólne, w zakładce Domeny & DNS) — CMD_API_SUBDOMAINS
  // ---------------------------------------------------------------------------

  /** Lista wszystkich poddomen konta (po wszystkich domenach konta). */
  async listHostingSubdomains(
    subscriptionId: string,
    userId: string,
  ): Promise<{
    rows: Array<{ id: string; subdomain: string; domain: string; url: string }>;
    domains: string[];
    fetchError: string | null;
  }> {
    const domainsRes = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const domains = domainsRes.domains.map((d) => d.name);
    if (domainsRes.fetchError) {
      return { rows: [], domains, fetchError: domainsRes.fetchError };
    }
    const rows: Array<{ id: string; subdomain: string; domain: string; url: string }> = [];
    try {
      for (const domain of domains.slice(0, 25)) {
        const raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
          domain,
        });
        for (const sub of parseDaSubdomainList(raw)) {
          rows.push({ id: `${sub}.${domain}`, subdomain: sub, domain, url: `https://${sub}.${domain}` });
        }
      }
      return { rows, domains, fetchError: null };
    } catch (err) {
      return { rows, domains, fetchError: err instanceof Error ? err.message : String(err) };
    }
  }

  async createHostingSubdomain(
    subscriptionId: string,
    userId: string,
    input: { domain: string; subdomain: string },
  ): Promise<{ ok: true; url: string }> {
    const domain = input.domain.trim();
    const label = input.subdomain.trim().toLowerCase();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    if (!/^[a-z0-9-]{1,63}$/.test(label)) {
      throw new BadRequestException('Nazwa poddomeny: a-z, 0-9 i myślnik (maks. 63 znaki).');
    }
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
      action: 'create',
      domain,
      subdomain: label,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SUBDOMAIN_CREATED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, subdomain: `${label}.${domain}` },
    });
    return { ok: true as const, url: `https://${label}.${domain}` };
  }

  async deleteHostingSubdomain(
    subscriptionId: string,
    userId: string,
    input: { domain: string; subdomain: string },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    const subdomain = input.subdomain.trim();
    if (!domain || !subdomain) throw new BadRequestException('Domena i poddomena są wymagane.');
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SUBDOMAINS', {
      action: 'delete',
      domain,
      select0: subdomain,
      contents: 'yes',
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SUBDOMAIN_DELETED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, subdomain: `${subdomain}.${domain}` },
    });
    return { ok: true as const };
  }

  // ---------------------------------------------------------------------------
  // Deploy — automatyczne wdrożenia Git oparte o cron DirectAdmin (CMD_API_CRON)
  // ---------------------------------------------------------------------------
  //
  // Każde zadanie wdrożenia to wpis cron z komendą `git pull` w docroot domeny.
  // Komendy zarządzane przez Verris kończą się markerem `# verris-deploy …`,
  // dzięki czemu odróżniamy je od zwykłych cronów klienta.

  async listDeployJobs(
    subscriptionId: string,
    userId: string,
  ): Promise<DeployJobsResponseDto> {
    const domainsRes = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const domains = domainsRes.domains.map((d) => d.name);
    const cron = await this.listHostingCronJobs(subscriptionId, userId);
    if (cron.fetchError) {
      return { rows: [], domains, primaryDomain: domainsRes.primaryDomain, fetchError: cron.fetchError };
    }
    const rows: DeployJobDto[] = [];
    for (const job of cron.rows) {
      const parsed = parseDeployCommand(job.command);
      if (!parsed) continue;
      rows.push({
        id: job.id,
        domain: parsed.domain,
        command: job.command,
        branch: parsed.branch,
        frequency: scheduleToFrequency(job.schedule),
        schedule: job.schedule,
      });
    }
    return { rows, domains, primaryDomain: domainsRes.primaryDomain, fetchError: null };
  }

  async createDeployJob(
    subscriptionId: string,
    userId: string,
    input: { domain: string; branch?: string; buildCommand?: string; frequency: DeployFrequency },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);

    const branch = (input.branch?.trim() || '').replace(/[^A-Za-z0-9._/-]/g, '');
    const build = (input.buildCommand?.trim() || '').replace(/[\r\n]+/g, ' ');
    if (build && /[;&|`$<>]/.test(build)) {
      throw new BadRequestException('Komenda build zawiera niedozwolone znaki specjalne.');
    }
    const schedule = frequencyToSchedule(input.frequency);
    const command = buildDeployCommand({ domain, branch, build });

    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_CRON', {
      action: 'create',
      minute: schedule.minute,
      hour: schedule.hour,
      day_of_month: schedule.dayOfMonth,
      month: schedule.month,
      day_of_week: schedule.dayOfWeek,
      command,
    });
    return { ok: true as const };
  }

  async deleteDeployJob(subscriptionId: string, userId: string, id: string) {
    return this.deleteHostingCronJob(subscriptionId, userId, id);
  }

  /** GET helper (mirror of daFormForSubscription) for DA endpoints that list via query params. */
  private async daGetForSubscription(
    subscriptionId: string,
    userId: string,
    path: string,
    params: Record<string, string>,
  ): Promise<URLSearchParams> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.id) throw new BadRequestException('Subscription has no hosting account yet');
    const client = await this.getClientForHostingAccount(sub.account.id, userId);
    const axiosClient = (client as unknown as { client?: { get: Function } }).client;
    if (!axiosClient) throw new BadRequestException('DirectAdmin client is not available');
    const res = await axiosClient.get(path, {
      params: { ...params, api: 'yes', json: 'yes' },
      timeout: 15_000,
    });
    return this.parseKvPayload(res?.data);
  }

  /**
   * Lists the LIVE TLS certificate per domain on the account. For each domain we
   * read the installed certificate via DA `CMD_API_SSL` and parse the X.509 to
   * surface real issuer + expiry + status (no placeholders).
   */
  async listHostingSslCertificates(
    subscriptionId: string,
    userId: string,
  ): Promise<{ rows: HostingSslRowDto[]; fetchError: string | null }> {
    const domainsRes = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    if (domainsRes.fetchError) {
      return { rows: [], fetchError: domainsRes.fetchError };
    }
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub?.account?.id) {
      return { rows: [], fetchError: 'Konto hostingowe nie jest jeszcze gotowe.' };
    }

    let axiosClient: { get: Function } | undefined;
    try {
      const client = await this.getClientForHostingAccount(sub.account.id, userId);
      axiosClient = (client as unknown as { client?: { get: Function } }).client;
    } catch (err) {
      return { rows: [], fetchError: err instanceof Error ? err.message : String(err) };
    }
    if (!axiosClient) {
      return { rows: [], fetchError: 'DirectAdmin client is not available' };
    }

    // Cap to keep the call bounded for accounts with many domains.
    const domains = domainsRes.domains.slice(0, 50);
    const rows: HostingSslRowDto[] = [];
    for (const d of domains) {
      rows.push(await this.inspectDomainSsl(axiosClient, d.name));
    }
    return { rows, fetchError: null };
  }

  private async inspectDomainSsl(
    axiosClient: { get: Function },
    domain: string,
  ): Promise<HostingSslRowDto> {
    const none: HostingSslRowDto = {
      id: domain,
      domain,
      issuer: '—',
      status: 'NONE',
      expiresAt: null,
      isLetsEncrypt: false,
      daysLeft: null,
      coveredNames: [],
      isWildcard: false,
    };
    try {
      const res = await axiosClient.get('/CMD_API_SSL', {
        params: { domain, action: 'view' },
        timeout: 15_000,
      });
      const kv = this.parseKvPayload(String(res?.data ?? ''));
      // Find the certificate PEM among the returned values (never the private key).
      let certPem = '';
      for (const [, value] of kv.entries()) {
        if (value.includes('BEGIN CERTIFICATE')) {
          certPem = value;
          break;
        }
      }
      if (!certPem.includes('BEGIN CERTIFICATE')) return none;

      const cert = new X509Certificate(certPem);
      const validTo = new Date(cert.validTo);
      if (Number.isNaN(validTo.getTime())) return none;
      const now = new Date();
      const issuer = parseCertOrg(cert.issuer);
      const isLetsEncrypt = /let'?s encrypt/i.test(cert.issuer);
      let status: HostingSslStatus = 'VALID';
      if (validTo <= now) status = 'EXPIRED';
      else if (validTo.getTime() - now.getTime() < 14 * 24 * 60 * 60 * 1000) status = 'EXPIRING';
      const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      // SAN → lista pokrywanych nazw (np. „example.pl", „*.example.pl").
      const coveredNames = (cert.subjectAltName ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^DNS:/i, '').trim())
        .filter((s) => s.length > 0);
      const isWildcard = coveredNames.some((n) => n.startsWith('*.'));
      return {
        id: domain,
        domain,
        issuer,
        status,
        expiresAt: validTo.toISOString(),
        isLetsEncrypt,
        daysLeft,
        coveredNames,
        isWildcard,
      };
    } catch {
      // No cert installed / DA returned an error for this domain → treat as none.
      return none;
    }
  }

  async listHostingBackups(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');

    // S-1 — status ochrony off-site (utrata węzła ≠ utrata danych). Czytany z
    // ostatniego raportu node-offsite-backup.sh zapisanego na Server.
    const srv = sub.account?.server;
    const offsite = srv
      ? {
          protected: Boolean(srv.lastOffsiteBackupOk),
          lastRunAt: srv.lastOffsiteBackupAt ? srv.lastOffsiteBackupAt.toISOString() : null,
          lastRunOk: srv.lastOffsiteBackupOk ?? null,
        }
      : { protected: false, lastRunAt: null, lastRunOk: null };

    if (!sub.account) {
      return { rows: [], fetchError: null as string | null, offsite };
    }
    if (!sub.account.daPasswordEnc) {
      return {
        rows: [],
        fetchError:
          'Brak zapisanego dostępu do DirectAdmin dla tego konta (provisioningu).',
        offsite,
      };
    }
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) {
      return { rows: [], fetchError: 'Brak domeny dla konta hostingowego.', offsite };
    }
    try {
      let raw: URLSearchParams;
      try {
        raw = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_SITE_BACKUP', {
          domain,
        });
      } catch {
        raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SITE_BACKUP', {
          domain,
        });
      }
      const rows = this.parseDaBackupFileRows(raw);
      if (rows.length > 0) {
        return { rows, fetchError: null as string | null, offsite };
      }
      const fm = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_FILE_MANAGER', {
        path: '/backups',
      });
      return { rows: this.parseDaBackupFileRows(fm), fetchError: null as string | null, offsite };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingBackups sub=${subscriptionId}: ${msg}`);
      return { rows: [], fetchError: msg, offsite };
    }
  }

  /**
   * G‑1: synchronizuje harmonogram backupowych cronów z trybem EKO.
   * - ecoEnabled=true  => dzienny (`day_of_week=*`) -> tygodniowy (`0`, niedziela)
   * - ecoEnabled=false => tygodniowy (`day_of_week=0`) -> dzienny (`*`)
   */
  async applyEcoModeBackupCronPolicy(
    subscriptionId: string,
    userId: string,
    ecoEnabled: boolean,
  ): Promise<{ adjusted: number; notice: string | null }> {
    const { rows, fetchError } = await this.listHostingCronJobs(subscriptionId, userId);
    if (fetchError) {
      return {
        adjusted: 0,
        notice: `Bez zmian harmonogramu w DA: ${fetchError}`,
      };
    }
    const backupRe = /SITE_BACKUP|CMD_API_SITE_BACKUP|sitebackup/i;
    let adjusted = 0;
    for (const row of rows) {
      if (!backupRe.test(row.command)) continue;
      const parts = row.schedule.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const dow = parts[4];
      const shouldAdjust = ecoEnabled ? dow === '*' : dow === '0';
      if (!shouldAdjust) continue;
      const minute = parts[0] === '*' ? '0' : parts[0];
      const hour = parts[1] === '*' ? '2' : parts[1];
      try {
        await this.deleteHostingCronJob(subscriptionId, userId, row.id);
        await this.createHostingCronJob(subscriptionId, userId, {
          minute,
          hour,
          dayOfMonth: '*',
          month: '*',
          dayOfWeek: ecoEnabled ? '0' : '*',
          command: row.command,
        });
        adjusted += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `applyEcoModeBackupCronPolicy: failed sub=${subscriptionId} cronId=${row.id}: ${msg}`,
        );
      }
    }
    const notice =
      adjusted > 0
        ? ecoEnabled
          ? `W DirectAdmin zaktualizowano ${adjusted} zadań cron z backupem: teraz cotygodniowo (niedziela, zachowana godzina jeśli była ustawiona).`
          : `W DirectAdmin zaktualizowano ${adjusted} zadań cron z backupem: przywrócono tryb dzienny.`
        : null;
    return { adjusted, notice };
  }

  /**
   * G‑5: natychmiastowa „kopia snapshot” konta — `CMD_API_SITE_BACKUP` (asynchronicznie po stronie DA).
   */
  async createHostingSiteBackupNow(subscriptionId: string, userId: string): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub?.account) {
      throw new BadRequestException('Brak konta hostingowego dla tej usługi.');
    }
    const domain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!domain) {
      throw new BadRequestException('Brak domeny dla konta hostingowego.');
    }
    const form: Record<string, string> = {
      action: 'backup',
      type: 'sitebackup',
      domain,
      database_data_aware: 'yes',
      email_data_aware: 'yes',
      select0: 'domain',
      select1: 'subdomain',
      select2: 'email',
      select3: 'forwarder',
      select4: 'autoresponder',
      select5: 'vacation',
      select6: 'list',
      select7: 'emailsettings',
      select8: 'ftp',
      select9: 'ftpsettings',
      select10: 'database',
      select11: 'database_data',
      select12: 'email_data',
    };
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SITE_BACKUP', form, {
      timeoutMs: 120_000,
    });
    // Record the trigger so the health score reflects a fresh backup even before
    // the next DA backup-list refresh.
    await this.prisma.account
      .update({ where: { subscriptionId }, data: { lastBackupAt: new Date() } })
      .catch(() => undefined);
    return { ok: true as const };
  }

  /**
   * Restores a previously created DirectAdmin site backup onto the account
   * (`CMD_API_SITE_BACKUP action=restore`). `userId` must be the account owner
   * (the restore worker passes the owner's id). Scope flags select which areas
   * to overwrite; at least one must be true. Long-running — pass a generous
   * timeout. This OVERWRITES the selected areas on the live account.
   */
  async restoreHostingBackup(
    subscriptionId: string,
    userId: string,
    opts: { fileName: string; files: boolean; databases: boolean; email: boolean },
  ): Promise<{ ok: true }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub?.account) {
      throw new BadRequestException('Brak konta hostingowego dla tej usługi.');
    }
    const restoreDomain = await this.syncPrimaryDomainForSubscription(subscriptionId, userId);
    if (!restoreDomain) {
      throw new BadRequestException('Brak domeny dla konta hostingowego.');
    }
    if (!opts.files && !opts.databases && !opts.email) {
      throw new BadRequestException('Wybierz przynajmniej jeden zakres do przywrócenia.');
    }

    const selects: string[] = [];
    const push = (v: string) => selects.push(v);
    if (opts.files) {
      push('domain');
      push('subdomain');
      push('ftp');
      push('ftpsettings');
    }
    if (opts.email) {
      push('email');
      push('emailsettings');
      push('email_data');
      push('forwarder');
      push('autoresponder');
      push('vacation');
      push('list');
    }
    if (opts.databases) {
      push('database');
      push('database_data');
    }

    const form: Record<string, string> = {
      action: 'restore',
      domain: restoreDomain,
      file: opts.fileName,
    };
    selects.forEach((value, idx) => {
      form[`select${idx}`] = value;
    });

    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SITE_BACKUP', form, {
      timeoutMs: 600_000,
    });
    return { ok: true as const };
  }

  /**
   * Bezwzględne adresy przydatnego UI w DA (bez SSO — tak jak link z panelu do „Zaloguj do DA”).
   */
  async getHostingDaLinksForSubscription(subscriptionId: string, userId: string): Promise<{
    panelBaseUrl: string;
    panelDisplayHost: string;
    databasesUrl: string;
    emailUrl: string;
    sslUrl: string;
    fileManagerUrl: string;
    domainsUrl: string;
    dnsUrl: string;
    domainManageUrl: string;
    stagingHint: string;
    daUsername: string | null;
    daPassword: string | null;
    fetchError: string | null;
  }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account?.server) {
      return {
        panelBaseUrl: '',
        panelDisplayHost: '',
        databasesUrl: '',
        emailUrl: '',
        sslUrl: '',
        fileManagerUrl: '',
        domainsUrl: '',
        dnsUrl: '',
        domainManageUrl: '',
        stagingHint: '',
        daUsername: null,
        daPassword: null,
        fetchError: null,
      };
    }
    const server = sub.account.server;
    const panelBaseUrl = this.hostingPanelBaseUrl(server);
    const panelDisplayHost = this.hostingPanelDisplayHost(server);
    const primaryDomain =
      (await this.syncPrimaryDomainForSubscription(subscriptionId, userId)) ??
      sub.account.domain;
    const evo = this.hostingEvolutionLinks(panelBaseUrl, primaryDomain);
    let daPassword: string | null = null;
    if (sub.account.daPasswordEnc) {
      try {
        daPassword = this.crypto.decrypt(sub.account.daPasswordEnc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Could not decrypt DA password for account=${sub.account.id}: ${msg}`,
        );
      }
    }
    return {
      panelBaseUrl,
      panelDisplayHost,
      databasesUrl: evo.databasesUrl,
      emailUrl: evo.emailUrl,
      sslUrl: evo.sslUrl,
      fileManagerUrl: evo.fileManagerUrl,
      domainsUrl: evo.domainsUrl,
      dnsUrl: evo.dnsUrl,
      domainManageUrl: evo.domainManageUrl,
      stagingHint: evo.domainManageUrl,
      daUsername: sub.account.daUsername,
      daPassword,
      fetchError: daPassword ? null : 'Hasło do panelu hostingu jest niedostępne — skontaktuj się z pomocą techniczną.',
    };
  }

  /**
   * Idempotentnie nadpisuje pakiety DA (starter/pro/business) realnymi limitami
   * z planów Verris — bez flag u* (obecność u<pole> w DA 1.697 = „Bez ograniczeń”).
   */
  async syncPlanPackagesForServer(serverId: string): Promise<{ synced: string[] }> {
    const client = await this.getClientForServer(serverId);
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const synced: string[] = [];
    for (const plan of plans) {
      const spec = buildDaPackageSpecFromPlan(planResourceFields(plan));
      await client.upsertUserPackage(spec);
      synced.push(plan.slug);
      this.logger.log(`DA package synced server=${serverId} slug=${plan.slug}`);
    }
    return { synced };
  }
}

function emptyMetric(): { used: number | null; limit: number | null } {
  return { used: null, limit: null };
}

/**
 * Extracts a human label from an X.509 issuer string (Node renders it as
 * newline-separated `C=…\nO=…\nCN=…`). Prefer the organisation, then the CN.
 */
/**
 * Parsuje listę poddomen z odpowiedzi DA `CMD_API_SUBDOMAINS`.
 * Ten DirectAdmin zwraca każdą poddomenę jako KLUCZ (wartość pusta), np.
 * `qatest2=`. Starsze/inne wersje używają `list0=qatest2` lub `list[]=qatest2`
 * — obsługujemy oba warianty. Pomijamy meta-klucze (error/text/details).
 */
function parseDaSubdomainList(raw: URLSearchParams): string[] {
  const META = new Set(['error', 'text', 'details']);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [k, v] of raw.entries()) {
    const key = k.trim();
    if (!key || META.has(key.toLowerCase())) continue;
    const name = /^list(\d+|\[\])?$/i.test(key) ? v.trim() : key;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function parseCertOrg(issuer: string): string {
  const fields: Record<string, string> = {};
  for (const line of issuer.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0) fields[line.slice(0, idx).trim().toUpperCase()] = line.slice(idx + 1).trim();
  }
  return fields.O || fields.CN || issuer.replace(/\s+/g, ' ').trim() || '—';
}

/** Parses a DirectAdmin numeric value; returns null for empty/non-numeric. */
function daNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** DA limit: 'unlimited' or empty → null (∞); otherwise the numeric value. */
function daLimit(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'unlimited') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function daMetric(
  used: string | null | undefined,
  limit: string | null | undefined,
): { used: number | null; limit: number | null } {
  return { used: daNumber(used), limit: daLimit(limit) };
}

function parseDaBool(value: string | null | undefined): boolean | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (v === 'on' || v === 'yes' || v === '1' || v === 'true') return true;
  if (v === 'off' || v === 'no' || v === '0' || v === 'false') return false;
  return null;
}

/** Strong, DirectAdmin-friendly database password (no shell-significant chars). */
function generateDbPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Vs${out}`;
}

const DEPLOY_MARKER = '# verris-deploy';

/** Builds the cron command for a scheduled Git deploy in a domain's docroot. */
function buildDeployCommand(input: { domain: string; branch: string; build: string }): string {
  const docroot = `$HOME/domains/${input.domain}/public_html`;
  const pull = input.branch ? `git pull origin ${input.branch}` : 'git pull';
  const parts = [`cd ${docroot}`, pull];
  if (input.build) parts.push(input.build);
  const marker = `${DEPLOY_MARKER} d=${input.domain}${input.branch ? ` b=${input.branch}` : ''}`;
  return `${parts.join(' && ')} ${marker}`;
}

/** Extracts the Verris-managed deploy metadata from a cron command, or null. */
function parseDeployCommand(command: string): { domain: string; branch: string | null } | null {
  const idx = command.indexOf(DEPLOY_MARKER);
  if (idx === -1) return null;
  const marker = command.slice(idx);
  const domain = /\bd=([^\s]+)/.exec(marker)?.[1] ?? null;
  if (!domain) return null;
  const branch = /\bb=([^\s]+)/.exec(marker)?.[1] ?? null;
  return { domain, branch };
}

function frequencyToSchedule(frequency: DeployFrequency): {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
} {
  switch (frequency) {
    case 'every_15m':
      return { minute: '*/15', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
    case 'hourly':
      return { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
    case 'daily':
      return { minute: '30', hour: '3', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
  }
}

function scheduleToFrequency(schedule: string): DeployFrequency {
  const minute = schedule.trim().split(/\s+/)[0] ?? '';
  if (minute.startsWith('*/')) return 'every_15m';
  const hour = schedule.trim().split(/\s+/)[1] ?? '';
  if (hour === '*') return 'hourly';
  return 'daily';
}

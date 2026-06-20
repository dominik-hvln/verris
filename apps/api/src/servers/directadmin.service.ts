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
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { buildDaPackageSpecFromPlan, planResourceFields } from './da-package-spec';
import { resolveHostingPrimaryDomain } from './hosting-primary-domain';

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
    fetchError: string | null;
  }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { include: { server: true } } },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      return { databases: [], daUsername: null, fetchError: null };
    }
    const daUsername = sub.account.daUsername;
    if (!sub.account.daPasswordEnc) {
      return {
        databases: [],
        daUsername,
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
        fetchError: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingMysqlForSubscription sub=${subscriptionId}: ${msg}`);
      return {
        databases: [],
        daUsername,
        fetchError: msg,
      };
    }
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
    input: { domain: string; includeWww?: boolean },
  ): Promise<{ ok: true }> {
    const domain = input.domain.trim();
    if (!domain) throw new BadRequestException('Domena jest wymagana.');
    await this.assertDomainOnSubscription(subscriptionId, userId, domain);

    const form: Record<string, string> = {
      action: 'save',
      type: 'create',
      request: 'letsencrypt',
      domain,
      name: domain,
      submit: 'Save',
      background: 'auto',
      wildcard: 'no',
      keysize: 'secp384r1',
      encryption: 'sha256',
      le_select0: domain,
    };
    if (input.includeWww) {
      form.le_select1 = `www.${domain}`;
    }
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_SSL', form, { timeoutMs: 120_000 });
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
        for (const [k, v] of raw.entries()) {
          if (!/^list\d+$/i.test(k) || !v) continue;
          rows.push({ id: `${v}.${domain}`, subdomain: v, domain, url: `https://${v}.${domain}` });
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
        for (const [k, v] of raw.entries()) {
          if (!/^list\d+$/i.test(k) || !v) continue;
          rows.push({ id: `${v}.${domain}`, subdomain: v, domain, url: `https://${v}.${domain}` });
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
      return {
        id: domain,
        domain,
        issuer,
        status,
        expiresAt: validTo.toISOString(),
        isLetsEncrypt,
      };
    } catch {
      // No cert installed / DA returned an error for this domain → treat as none.
      return none;
    }
  }

  async listHostingBackups(subscriptionId: string, userId: string) {
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
        return { rows, fetchError: null as string | null };
      }
      const fm = await this.daGetForSubscription(subscriptionId, userId, '/CMD_API_FILE_MANAGER', {
        path: '/backups',
      });
      return { rows: this.parseDaBackupFileRows(fm), fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`listHostingBackups sub=${subscriptionId}: ${msg}`);
      return { rows: [], fetchError: msg };
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

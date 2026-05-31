import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import type { ServiceConnectionInfoDto } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

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
    });
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
    });
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
    const primaryDomain = sub.account.domain;
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
    sslUrl: string;
    fileManagerUrl: string;
    domainsUrl: string;
    dnsUrl: string;
    domainManageUrl: string;
  } {
    const domainPath = encodeURIComponent(domain);
    return {
      databasesUrl: `${panelBaseUrl}/evo/user/databases/mysql`,
      sslUrl: `${panelBaseUrl}/evo/user/ssl`,
      fileManagerUrl: `${panelBaseUrl}/evo/user/filemanager/domains/${domainPath}`,
      domainsUrl: `${panelBaseUrl}/evo/user/domains`,
      dnsUrl: `${panelBaseUrl}/evo/user/dns/control/${domainPath}`,
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
      const raw = await client.listMysqlDatabases();
      const databases = raw.map((name) => ({ name }));
      return {
        databases,
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

  private parseKvPayload(payload: unknown): URLSearchParams {
    return new URLSearchParams(typeof payload === 'string' ? payload : String(payload ?? ''));
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
    const body = new URLSearchParams(form).toString();
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

  async listHostingFtpAccounts(subscriptionId: string, userId: string) {
    try {
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
        action: 'list',
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
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
      action: 'create',
      user: input.username,
      passwd: input.password,
      passwd2: input.password,
      domain: '',
      path: input.directory ?? '/',
    });
    return { ok: true as const };
  }

  async deleteHostingFtpAccount(subscriptionId: string, userId: string, username: string) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_FTP', {
      action: 'delete',
      user: username,
    });
    return { ok: true as const };
  }

  async listHostingEmailAccounts(subscriptionId: string, userId: string) {
    try {
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_POP', {
        action: 'list',
      });
      const rows: Array<{ id: string; email: string; quotaMb: number | null }> = [];
      for (const [k, v] of raw.entries()) {
        if (!/^user\d+$/i.test(k)) continue;
        const idx = k.replace(/\D/g, '');
        rows.push({
          id: `${v}:${idx}`,
          email: v.includes('@') ? v : `${v}`,
          quotaMb: raw.get(`quota${idx}`) ? Number(raw.get(`quota${idx}`)) : null,
        });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
    return { ok: true as const };
  }

  async listHostingCronJobs(subscriptionId: string, userId: string) {
    try {
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_CRON', {
        action: 'list',
      });
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
    return { ok: true as const };
  }

  async deleteHostingCronJob(subscriptionId: string, userId: string, id: string) {
    await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_CRON', {
      action: 'delete',
      select0: id,
    });
    return { ok: true as const };
  }

  async listHostingSslCertificates(subscriptionId: string, userId: string) {
    const domains = await this.listHostingDomainsForSubscription(subscriptionId, userId);
    const rows = domains.domains.map((d) => ({
      id: d.name,
      domain: d.name,
      issuer: '—',
      status: 'DOMAIN',
    }));
    return { rows, fetchError: domains.fetchError };
  }

  async listHostingBackups(subscriptionId: string, userId: string) {
    try {
      const raw = await this.daFormForSubscription(subscriptionId, userId, '/CMD_API_BACKUP', { action: 'list' });
      const rows: Array<{ id: string; fileName: string }> = [];
      for (const [k, v] of raw.entries()) {
        if (!/^list\d+$/i.test(k)) continue;
        rows.push({ id: k, fileName: v });
      }
      return { rows, fetchError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
    if (!sub?.account?.domain) {
      throw new BadRequestException('Brak konta hostingowego lub domeny dla tej usługi.');
    }
    const domain = sub.account.domain;
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
    if (!sub?.account?.domain) {
      throw new BadRequestException('Brak konta hostingowego lub domeny dla tej usługi.');
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
      domain: sub.account.domain,
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
    const evo = this.hostingEvolutionLinks(panelBaseUrl, sub.account.domain);
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
}

function emptyMetric(): { used: number | null; limit: number | null } {
  return { used: null, limit: null };
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

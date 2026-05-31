import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { randomBytes } from 'crypto';

export interface DirectAdminConfig {
  host: string;
  port: number;
  username: string;
  loginKey: string;
  secure?: boolean;
  /** Override the default 15s request timeout. */
  timeoutMs?: number;
  /** Set to true to verify TLS certificates (recommended in production). */
  rejectUnauthorized?: boolean;
}

export interface CreateAccountInput {
  username: string;
  email: string;
  domain: string;
  /** DirectAdmin package name; provisioning automatically falls back to "default". */
  packageName?: string;
  /** If omitted, a random 20-char password is generated and returned to the caller. */
  password?: string;
  /** Server IP — by default DA assigns a shared IP. */
  ip?: 'server' | 'shared' | string;
  notify?: 'yes' | 'no';
  /** Default panel language for the new account (e.g. `pl`). */
  language?: string;
}

/** A numeric DA package limit that may instead be "unlimited". */
export type DaLimit = number | 'unlimited';

/** Per-package feature toggles (DA ON/OFF switches). */
export interface DaPackageFeatures {
  cgi?: boolean;
  php?: boolean;
  ssl?: boolean;
  spam?: boolean;
  cron?: boolean;
  dnscontrol?: boolean;
  ssh?: boolean;
  redis?: boolean;
  git?: boolean;
  wordpress?: boolean;
}

/**
 * CloudLinux LVE limits stored at the *package* level (DA "Resource Limits"
 * section in the package editor). Applied so every account created from the
 * package inherits them, in addition to the per-account MODIFY_USER call.
 */
export interface DaPackageLveLimits {
  /** CPU SPEED %, e.g. 100 = one core full burst. */
  cpuPercent?: number;
  /** Physical memory limit in MB (DA `mem`). */
  memoryMb?: number;
  /** I/O bandwidth in KB/s (DA `io`). */
  ioKbps?: number;
  /** IOPS (DA `iops`). */
  iops?: number;
  /** Concurrent entry processes (DA `ep`). */
  entryProcesses?: number;
  /** Max processes / NPROC (DA `nproc`). */
  nproc?: number;
}

/**
 * Full DirectAdmin user-package definition derived from a Verris `Plan`.
 *
 * IMPORTANT: every numeric field is paired with an `u<field>` "unlimited"
 * toggle in the DA API. When a real limit is provided we send `u<field>=no`
 * so the value is honoured; sending `u<field>=yes` makes DA ignore the number
 * and show "Bez ograniczeń" in the UI (the Node-PL-01 bug). The `unlimited`
 * sentinel opts a field back into the unlimited toggle on purpose.
 */
export interface DaPackageSpec {
  /** Package name — must match `Plan.slug`. */
  name: string;
  /** Disk quota in MB (`quota`). */
  diskQuotaMb: DaLimit;
  /** Monthly transfer in MB (`bandwidth`). */
  bandwidthMb: DaLimit;
  /** Additional domains (`vdomains`). */
  domains: DaLimit;
  /** Subdomains (`nsubdomains`). */
  subdomains: DaLimit;
  /** E-mail accounts (`nemails`). */
  emailAccounts: DaLimit;
  /** E-mail forwarders (`nemailf`). */
  emailForwarders: DaLimit;
  /** Mailing lists (`nemailml`). */
  mailingLists: DaLimit;
  /** Autoresponders (`nemailr`). */
  autoresponders: DaLimit;
  /** MySQL databases (`mysql`). */
  databases: DaLimit;
  /** Domain pointers / aliases (`domainptr`). */
  domainPointers: DaLimit;
  /** FTP accounts (`ftp`). */
  ftpAccounts: DaLimit;
  features?: DaPackageFeatures;
  lve?: DaPackageLveLimits;
  /** Default panel language for accounts created from this package (e.g. `pl`). */
  language?: string;
  /** DirectAdmin skin (default `evolution`). */
  skin?: string;
}

/** @deprecated use {@link DaPackageSpec}. Kept for callers passing only disk quota. */
export interface EnsureUserPackageInput {
  name: string;
  /** Disk quota in MB (maps to DA `quota`). */
  diskQuotaMb: number;
}

export interface CreateAccountResult {
  username: string;
  password: string;
  domain: string;
  text: string | null;
}

export interface AccountResourceLimits {
  /** CloudLinux LVE: SPEED in % (e.g. 100 = 1 core full burst). */
  cpuPercent?: number;
  /** Soft RAM limit in MB (`pmem` in DA / LVE pmem). */
  memoryMb?: number;
  /** I/O kbps. */
  ioKbps?: number;
  /** IOPS. */
  iops?: number;
  /** Concurrent entry processes. */
  entryProcesses?: number;
  /** CloudLinux NPROC (max processes). */
  nproc?: number;
  /**
   * Backward-compat alias for NPROC used by older app code.
   * Prefer `nproc`.
   */
  workers?: number;
  /** Disk quota in megabytes (`quota` in DirectAdmin MODIFY_USER). */
  diskQuotaMb?: number;
}

/**
 * Thin client for DirectAdmin's URL-encoded REST API. Each call returns
 * a parsed object containing at least `{ success: true, text }` or throws on
 * `error=1` responses.
 *
 * The API uses `Authorization: Basic` with a *login key* (not the admin
 * password); generate one in DA → "Login Keys" with the minimal scope needed.
 */
export class DirectAdminClient {
  private client: AxiosInstance;

  constructor(config: DirectAdminConfig) {
    const protocol = config.secure !== false ? 'https' : 'http';
    const baseURL = `${protocol}://${config.host}:${config.port}`;
    const token = Buffer.from(`${config.username}:${config.loginKey}`).toString('base64');

    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
        Accept: '*/*',
      },
      timeout: config.timeoutMs ?? 15_000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.rejectUnauthorized ?? false,
      }),
    });
  }

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  async listUserPackages(): Promise<string[]> {
    const response = await this.client.get('/CMD_API_PACKAGES_USER');
    const params = new URLSearchParams(response.data);
    const list: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key.startsWith('list')) list.push(value);
    }
    return list;
  }

  /**
   * Builds the `CMD_API_MANAGE_USER_PACKAGES` body from a full package spec.
   *
   * The key correctness rule: a numeric limit is sent together with
   * `u<field>=no`; an `unlimited` sentinel sends `u<field>=yes`. Mixing a
   * number with `u<field>=yes` (the previous behaviour) makes DA ignore the
   * number and show "Bez ograniczeń" — that was the Node-PL-01 defect.
   */
  buildPackageParams(spec: DaPackageSpec): URLSearchParams {
    const params = new URLSearchParams({ add: 'Save', packagename: spec.name });

    const setLimit = (field: string, value: DaLimit, minWhenLimited = 0) => {
      if (value === 'unlimited') {
        params.set(field, 'unlimited');
        params.set(`u${field}`, 'yes');
      } else {
        const n = Math.max(minWhenLimited, Math.floor(value));
        params.set(field, String(n));
        params.set(`u${field}`, 'no');
      }
    };

    setLimit('quota', spec.diskQuotaMb, 1);
    setLimit('bandwidth', spec.bandwidthMb, 1);
    setLimit('vdomains', spec.domains);
    setLimit('nsubdomains', spec.subdomains);
    setLimit('nemails', spec.emailAccounts);
    setLimit('nemailf', spec.emailForwarders);
    setLimit('nemailml', spec.mailingLists);
    setLimit('nemailr', spec.autoresponders);
    setLimit('mysql', spec.databases);
    setLimit('domainptr', spec.domainPointers);
    setLimit('ftp', spec.ftpAccounts);

    const f = spec.features ?? {};
    const onOff = (v: boolean | undefined, dflt: boolean) => ((v ?? dflt) ? 'ON' : 'OFF');
    params.set('cgi', onOff(f.cgi, true));
    params.set('php', onOff(f.php, true));
    params.set('ssl', onOff(f.ssl, true));
    params.set('spam', onOff(f.spam, true));
    params.set('cron', onOff(f.cron, true));
    params.set('dnscontrol', onOff(f.dnscontrol, true));
    params.set('ssh', onOff(f.ssh, false));
    if (f.redis !== undefined) params.set('redis', onOff(f.redis, false));
    if (f.git !== undefined) params.set('git', onOff(f.git, false));
    if (f.wordpress !== undefined) params.set('wordpress', onOff(f.wordpress, false));

    // CloudLinux LVE limits at the package level. Field names per DirectAdmin
    // CloudLinux integration (verify against the installed DA version — see
    // ops/docs/NODE_BOOTSTRAP_V2.md "Vendor documentation & stack versions").
    const lve = spec.lve;
    if (lve) {
      if (lve.cpuPercent !== undefined) params.set('cpu', String(Math.floor(lve.cpuPercent)));
      if (lve.memoryMb !== undefined) params.set('mem', String(Math.floor(lve.memoryMb)));
      if (lve.ioKbps !== undefined) params.set('io', String(Math.floor(lve.ioKbps)));
      if (lve.iops !== undefined) params.set('iops', String(Math.floor(lve.iops)));
      if (lve.entryProcesses !== undefined) params.set('ep', String(Math.floor(lve.entryProcesses)));
      if (lve.nproc !== undefined) params.set('nproc', String(Math.floor(lve.nproc)));
    }

    if (spec.language) params.set('language', spec.language);
    params.set('skin', spec.skin ?? 'evolution');
    return params;
  }

  /**
   * Creates the package when missing (name must match `Plan.slug`). Use
   * {@link upsertUserPackage} from the audit/repair path to force-correct an
   * existing package whose limits drifted (e.g. legacy unlimited packages).
   */
  async ensureUserPackage(input: DaPackageSpec | EnsureUserPackageInput): Promise<void> {
    const spec = normalisePackageSpec(input);
    const existing = await this.listUserPackages();
    if (existing.includes(spec.name)) return;
    await this.upsertUserPackage(spec);
  }

  /**
   * Creates or overwrites a DA user package with the full spec. DirectAdmin's
   * `CMD_API_MANAGE_USER_PACKAGES` with `add=Save` is create-or-update keyed by
   * `packagename`, so this is idempotent and safe to re-run for repair.
   */
  async upsertUserPackage(input: DaPackageSpec | EnsureUserPackageInput): Promise<void> {
    const spec = normalisePackageSpec(input);
    const response = await this.client.post(
      '/CMD_API_MANAGE_USER_PACKAGES',
      this.buildPackageParams(spec).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.parseResponse(response.data);
  }

  /**
   * Reads a single package definition as a flat key=value map (DA returns the
   * package fields including `quota`, `uquota`, `bandwidth`, LVE values, …).
   * Used by the audit layer to detect drift (e.g. `uquota=ON` = unlimited).
   */
  async getUserPackageInfo(name: string): Promise<Record<string, string>> {
    const response = await this.client.get('/CMD_API_PACKAGES_USER', {
      params: { package: name },
    });
    const params = new URLSearchParams(response.data);
    const out: Record<string, string> = {};
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }

  async createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
    const password = input.password ?? generateRandomPassword();
    const body: Record<string, string> = {
      action: 'create',
      add: 'Submit',
      username: input.username,
      email: input.email,
      passwd: password,
      passwd2: password,
      domain: input.domain,
      package: input.packageName ?? 'default',
      ip: input.ip ?? 'shared',
      notify: input.notify ?? 'no',
    };
    if (input.language) body.language = input.language;
    const response = await this.client.post(
      '/CMD_API_ACCOUNT_USER',
      new URLSearchParams(body).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const parsed = this.parseResponse(response.data);
    return {
      username: input.username,
      password,
      domain: input.domain,
      text: parsed.text,
    };
  }

  async deleteAccount(username: string) {
    const response = await this.client.post(
      '/CMD_API_SELECT_USERS',
      new URLSearchParams({
        confirmed: 'Confirm',
        delete: 'yes',
        select0: username,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return this.parseResponse(response.data);
  }

  async suspendAccount(username: string) {
    return this.toggleSuspendStatus(username, true);
  }

  async unsuspendAccount(username: string) {
    return this.toggleSuspendStatus(username, false);
  }

  async toggleSuspendStatus(username: string, suspend: boolean) {
    const response = await this.client.post(
      '/CMD_API_SELECT_USERS',
      new URLSearchParams({
        location: 'CMD_SHOW_USERS',
        suspend: suspend ? 'Suspend' : 'Unsuspend',
        select0: username,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return this.parseResponse(response.data);
  }

  /**
   * Updates the resource limits for a user's account. Sends a `MODIFY_USER`
   * request — DA requires sending the full settings payload, so callers
   * normally pass effective values (plan + autoscaling delta).
   */
  async setAccountLimits(username: string, limits: AccountResourceLimits) {
    const params: Record<string, string> = {
      action: 'modify',
      user: username,
    };
    if (limits.memoryMb !== undefined) params.ram = String(limits.memoryMb);
    if (limits.cpuPercent !== undefined) params.cpu = String(limits.cpuPercent);
    if (limits.ioKbps !== undefined) params.io = String(limits.ioKbps);
    if (limits.iops !== undefined) params.iops = String(limits.iops);
    if (limits.entryProcesses !== undefined) params.ep = String(limits.entryProcesses);
    const nproc = limits.nproc ?? limits.workers;
    if (nproc !== undefined) params.nproc = String(nproc);
    if (limits.diskQuotaMb !== undefined) params.quota = String(limits.diskQuotaMb);

    const response = await this.client.post(
      '/CMD_API_MODIFY_USER',
      new URLSearchParams(params).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return this.parseResponse(response.data);
  }

  async listAccounts(): Promise<string[]> {
    const response = await this.client.get('/CMD_API_SHOW_USERS');
    const params = new URLSearchParams(response.data);
    const list: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key.startsWith('list')) list.push(value);
    }
    return list;
  }

  /**
   * Reads the user info block including assigned package and resource usage.
   */
  async getAccountInfo(username: string): Promise<Record<string, string>> {
    const response = await this.client.get('/CMD_API_SHOW_USER_CONFIG', {
      params: { user: username },
    });
    const params = new URLSearchParams(response.data);
    const out: Record<string, string> = {};
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Domains
  // ---------------------------------------------------------------------------

  async createDomain(domain: string) {
    const response = await this.client.post(
      '/CMD_API_DOMAIN',
      new URLSearchParams({
        action: 'create',
        domain,
        php: 'ON',
        ssl: 'ON',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return this.parseResponse(response.data);
  }

  async getDomains(): Promise<string[]> {
    const response = await this.client.get('/CMD_API_SHOW_DOMAINS');
    const params = new URLSearchParams(response.data);
    const domains: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key.startsWith('list')) domains.push(value);
    }
    if (domains.length === 0) {
      for (const [key] of params.entries()) {
        if (!['error', 'text', 'details'].includes(key) && key.includes('.')) {
          domains.push(key);
        }
      }
    }
    return Array.from(new Set(domains));
  }

  // ---------------------------------------------------------------------------
  // MySQL — user level (CMD_API_DATABASES)
  // ---------------------------------------------------------------------------

  /**
   * Lists MySQL database names for the authenticated (user-level) session.
   * See DirectAdmin user API: CMD_API_DATABASES (list / create / delete).
   */
  async listMysqlDatabases(): Promise<string[]> {
    const response = await this.client.post(
      '/CMD_API_DATABASES',
      '',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: (s) => s < 500,
      },
    );
    return this.parseMysqlDatabaseList(response.data);
  }

  // ---------------------------------------------------------------------------
  // Connectivity
  // ---------------------------------------------------------------------------

  /** Lightweight call used as a "ping" to verify credentials. */
  async ping(): Promise<{ ok: true }> {
    await this.client.get('/CMD_API_SHOW_DOMAINS');
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private parseMysqlDatabaseList(data: unknown): string[] {
    const text = typeof data === 'string' ? data : String(data ?? '');
    if (!text.includes('=') && text.trim().startsWith('<')) {
      return [];
    }
    const params = new URLSearchParams(text);
    const error = params.get('error');
    if (error && error !== '0') {
      const errText = params.get('text') ?? params.get('details') ?? 'Unknown DA error';
      throw new Error(`DirectAdmin API Error: ${errText}`.trim());
    }
    const names: string[] = [];
    const seen = new Set<string>();
    for (const [key, value] of params.entries()) {
      if (!value || !value.trim()) continue;
      if (/^list\d+$/.test(key) || /^name\d+$/.test(key) || /^database\d+$/i.test(key)) {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    if (names.length > 0) return names;
    for (const [key, value] of params.entries()) {
      if (!value.trim()) continue;
      if (['error', 'text', 'details', 'success'].includes(key)) continue;
      if (/^db\S*$/i.test(key) || key.toLowerCase() === 'database') {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    return names;
  }

  private parseResponse(data: string) {
    const params = new URLSearchParams(data);
    const error = params.get('error');
    if (error && error !== '0') {
      const details = params.get('details');
      const text = params.get('text');
      throw new Error(`DirectAdmin API Error: ${text ?? ''} — ${details ?? ''}`.trim());
    }
    return {
      success: true as const,
      text: params.get('text'),
      details: params.get('details'),
    };
  }
}

/**
 * Accepts either a full {@link DaPackageSpec} or the legacy disk-only input and
 * always returns a complete spec. Legacy callers (disk quota only) get a
 * conservative limited package: real disk quota with `uquota=no`, generous but
 * bounded e-mail/db/ftp counts and unlimited bandwidth — never the old
 * "everything unlimited" payload.
 */
export function normalisePackageSpec(input: DaPackageSpec | EnsureUserPackageInput): DaPackageSpec {
  if (isFullPackageSpec(input)) return input;
  return {
    name: input.name,
    diskQuotaMb: input.diskQuotaMb,
    bandwidthMb: 'unlimited',
    domains: 'unlimited',
    subdomains: 'unlimited',
    emailAccounts: 'unlimited',
    emailForwarders: 'unlimited',
    mailingLists: 10,
    autoresponders: 10,
    databases: 'unlimited',
    domainPointers: 10,
    ftpAccounts: 'unlimited',
    features: { cgi: true, php: true, ssl: true, spam: true, cron: true, dnscontrol: true, ssh: false },
    language: 'pl',
    skin: 'evolution',
  };
}

function isFullPackageSpec(input: DaPackageSpec | EnsureUserPackageInput): input is DaPackageSpec {
  return 'bandwidthMb' in input;
}

function generateRandomPassword(length = 20): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^*_+';
  const bytes = randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += charset.charAt(bytes[i] % charset.length);
  }
  return pwd;
}

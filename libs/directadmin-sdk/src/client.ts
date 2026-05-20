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

  async createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
    const password = input.password ?? generateRandomPassword();
    const response = await this.client.post(
      '/CMD_API_ACCOUNT_USER',
      new URLSearchParams({
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
      }).toString(),
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

function generateRandomPassword(length = 20): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^*_+';
  const bytes = randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += charset.charAt(bytes[i] % charset.length);
  }
  return pwd;
}

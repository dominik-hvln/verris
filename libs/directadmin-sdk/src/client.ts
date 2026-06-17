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

/** A single entry returned by the file manager listing (P-4). */
export interface DaFileEntry {
  name: string;
  type: 'dir' | 'file';
  sizeBytes: number;
  /** DA-reported modified timestamp (string as returned), or null. */
  modified: string | null;
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
  /** Authoritative nameservers for the account's zone (DA ns1/ns2). */
  ns1?: string;
  ns2?: string;
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
 *
 * NOTE: DirectAdmin only persists these `cpu/mem/io/iops/ep/nproc` package
 * params when its CloudLinux LVE integration is active (CageFS / LVE Manager
 * installed). On nodes without that integration DA silently drops them and
 * uses its native systemd-cgroup limiter instead — see {@link DaPackageCgroupLimits}.
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
 * DirectAdmin native systemd-cgroup resource limits (package "Limity zasobów"
 * section, shown when `cgroup=1` / `HAVE_CGROUPS=1`). These are enforced by
 * systemd on each user's slice and are the active limiter on DA nodes that are
 * NOT CloudLinux-LVE-integrated.
 *
 * Verified live on DA 1.697 (2026-05-31): a blank value = unlimited (there is
 * NO `u<field>` flag here — unlike the quota/bandwidth fields). Setting them on
 * the package propagates to existing users and applies immediately via systemd
 * (e.g. `CPUQuotaPerSecUSec`, `MemoryMax`, `TasksMax`). They coexist with
 * CloudLinux LVE at identical ceilings.
 */
export interface DaPackageCgroupLimits {
  /** systemd `CPUQuota` in % of one core (100 = 1 core). */
  cpuQuotaPercent?: number;
  /** systemd `MemoryHigh` soft throttle, in MB. */
  memoryHighMb?: number;
  /** systemd `MemoryMax` hard limit (OOM), in MB. */
  memoryMaxMb?: number;
  /** systemd `IOReadBandwidthMax`, in KB/s. */
  ioReadBandwidthKbps?: number;
  /** systemd `IOWriteBandwidthMax`, in KB/s. */
  ioWriteBandwidthKbps?: number;
  /** systemd `IOReadIOPSMax`. */
  ioReadIops?: number;
  /** systemd `IOWriteIOPSMax`. */
  ioWriteIops?: number;
  /** systemd `TasksMax` (max processes + threads on the slice). */
  tasksMax?: number;
}

/**
 * Full DirectAdmin user-package definition derived from a Verris `Plan`.
 *
 * IMPORTANT: every numeric field is paired with an `u<field>` "unlimited"
 * toggle in the DA API. DA decides "unlimited" by the **presence** of
 * `u<field>` (the value is ignored — even `u<field>=no` means unlimited), so a
 * real limit is sent as `<field>=<n>` with NO `u<field>`, while the
 * `unlimited` sentinel emits `u<field>=yes`. Sending a number together with
 * any `u<field>` made DA show "Bez ograniczeń" — the Node-PL-01 bug.
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
  /** DirectAdmin systemd-cgroup limits (active limiter on non-LVE-integrated nodes). */
  cgroup?: DaPackageCgroupLimits;
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
  private readonly usernameValue: string;
  private readonly config: DirectAdminConfig;

  constructor(config: DirectAdminConfig) {
    this.config = config;
    this.usernameValue = config.username;
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
        // Audit F-04: verify TLS certs by default. Callers must opt OUT
        // explicitly (per-node `daAllowInvalidCert`) — never silently.
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      }),
    });
  }

  // ---------------------------------------------------------------------------
  // Impersonation (P-4)
  // ---------------------------------------------------------------------------

  /**
   * Returns a client that issues API calls **as a specific user**, using the
   * admin/reseller login key with DirectAdmin's `admin|user` auth convention
   * (Basic auth username "admin|targetUser"). All commands then run scoped to
   * that account — required for per-account file operations.
   *
   * The caller (this client) must be an admin/reseller whose login key can
   * impersonate `targetUser`.
   */
  asUser(targetUser: string): DirectAdminClient {
    const base = this.usernameValue.split('|')[0];
    return new DirectAdminClient({
      ...this.config,
      username: `${base}|${targetUser}`,
    });
  }

  // ---------------------------------------------------------------------------
  // File manager (P-4)
  //
  // NOTE: exact DA file-manager command/param names vary slightly by version;
  // these target DirectAdmin 1.6x. Verify against the live node and adjust if
  // a call returns an unexpected payload. All paths are account-relative
  // (e.g. "/domains/example.com/public_html"); the caller (FilesModule) is
  // responsible for sandboxing them to the account home.
  // ---------------------------------------------------------------------------

  /** Lists a directory. Returns entries with type/size/modified. */
  async listDir(path: string): Promise<DaFileEntry[]> {
    const response = await this.client.get('/CMD_API_FILE_MANAGER', {
      params: { path },
    });
    const params = new URLSearchParams(response.data);
    // DA error payloads surface as error=1&text=...&details=...
    if (params.get('error') === '1') {
      throw new Error(params.get('text') || 'DirectAdmin file manager error');
    }
    const entries: DaFileEntry[] = [];
    for (const [key, value] of params.entries()) {
      if (key === 'error' || key === 'text' || key === 'details') continue;
      // Each value is a urlencoded sub-record: type=dir&size=..&date=..
      const info = new URLSearchParams(value);
      const type = (info.get('type') || '').toLowerCase();
      entries.push({
        name: decodeURIComponent(key),
        type: type === 'dir' ? 'dir' : 'file',
        sizeBytes: Number.parseInt(info.get('size') || '0', 10) || 0,
        modified: info.get('date') || null,
      });
    }
    return entries.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    );
  }

  /** Reads a (text) file's raw content. */
  async readFile(path: string): Promise<string> {
    const response = await this.client.get(`/CMD_FILE_MANAGER${ensureLeadingSlash(path)}`, {
      responseType: 'text',
      transformResponse: [(d) => d],
    });
    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  }

  /** Downloads a file as raw bytes (for binary download / streaming). */
  async downloadFile(path: string): Promise<Buffer> {
    const response = await this.client.get(`/CMD_FILE_MANAGER${ensureLeadingSlash(path)}`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data as ArrayBuffer);
  }

  /** Writes/overwrites a text file (`action=edit`). */
  async writeFile(dir: string, filename: string, content: string): Promise<void> {
    const data = await this.client.post(
      '/CMD_FILE_MANAGER',
      new URLSearchParams({
        action: 'edit',
        path: dir,
        text: content,
        filename,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.assertFileManagerOk(data.data);
  }

  /** Creates a new folder inside `dir`. */
  async makeDir(dir: string, name: string): Promise<void> {
    const data = await this.client.post(
      '/CMD_FILE_MANAGER',
      new URLSearchParams({ action: 'folder', path: dir, name }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.assertFileManagerOk(data.data);
  }

  /** Renames a single entry within `dir`. */
  async renameEntry(dir: string, oldName: string, newName: string): Promise<void> {
    const data = await this.client.post(
      '/CMD_FILE_MANAGER',
      new URLSearchParams({
        action: 'rename',
        path: dir,
        old: `${stripTrailingSlash(dir)}/${oldName}`,
        filename: newName,
        overwrite: 'no',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.assertFileManagerOk(data.data);
  }

  /** Deletes one or more entries within `dir` (files or folders). */
  async deleteEntries(dir: string, names: string[]): Promise<void> {
    const body = new URLSearchParams({ action: 'multiple', button: 'delete', path: dir });
    names.forEach((n, i) => body.append(`select${i}`, n));
    const data = await this.client.post('/CMD_FILE_MANAGER', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    this.assertFileManagerOk(data.data);
  }

  /** Uploads a file into `dir`. `content` is the raw file bytes. */
  async uploadFile(dir: string, filename: string, content: Buffer): Promise<void> {
    // DA upload expects multipart/form-data with action=upload + path + file1.
    const boundary = `----verris${Date.now().toString(16)}`;
    const head =
      `--${boundary}\r\nContent-Disposition: form-data; name="action"\r\n\r\nupload\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${dir}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file1"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([Buffer.from(head, 'utf8'), content, Buffer.from(tail, 'utf8')]);
    const data = await this.client.post('/CMD_FILE_MANAGER', payload, {
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    this.assertFileManagerOk(data.data);
  }

  /** Throws if a DA file-manager response signals an error. */
  private assertFileManagerOk(data: unknown): void {
    const params = this.daPayloadToParams(data);
    if (params.get('error') === '1') {
      throw new Error(
        params.get('text') || params.get('details') || 'DirectAdmin file manager operation failed',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  /**
   * Admin IP manager — IPs registered on the server (`CMD_API_IP_CONFIG`).
   * Provisioning with `ip=<public IP>` requires the node's public IP to be on
   * this list; otherwise DA rejects account creation with
   * "A valid IP was not provided" (audit F-07 validator).
   */
  async listServerIps(): Promise<string[]> {
    const response = await this.client.get('/CMD_API_IP_CONFIG');
    const params = new URLSearchParams(response.data);
    const list: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key.startsWith('list')) list.push(value);
    }
    return list;
  }

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
   * The key correctness rule (verified live against DirectAdmin 1.697 on
   * 2026-05-31): DA flags a field as "unlimited" by the **presence** of the
   * `u<field>` parameter — its value is irrelevant. Sending `u<field>=no`
   * still makes the field unlimited (the Node-PL-01 defect, where every limit
   * came back "Bez ograniczeń" despite a numeric value). Therefore:
   *   - real numeric limit  → send `<field>=<n>` and OMIT `u<field>` entirely;
   *   - unlimited           → send `u<field>=yes` (DA stores `<field>=unlimited`).
   */
  buildPackageParams(spec: DaPackageSpec): URLSearchParams {
    const params = new URLSearchParams({ add: 'Save', packagename: spec.name });

    const setLimit = (field: string, value: DaLimit, minWhenLimited = 0) => {
      if (value === 'unlimited') {
        // Presence of u<field> (any value) = unlimited; value is ignored by DA.
        params.set(`u${field}`, 'yes');
        params.set(field, 'unlimited');
      } else {
        // Real limit: ONLY the number. Never emit u<field>, or DA 1.6x+ treats
        // the field as unlimited regardless of the value sent.
        const n = Math.max(minWhenLimited, Math.floor(value));
        params.set(field, String(n));
        params.delete(`u${field}`);
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

    // DirectAdmin systemd-cgroup limits (the active limiter when DA is not
    // CloudLinux-LVE-integrated). blank value = unlimited; no u<field> flag.
    // Always emit the 8 fields so "unlimited" can be set explicitly. Value
    // formats verified on DA 1.697: CPUQuota "<n>%", Memory* "<n>M",
    // IO*BandwidthMax "<n>K" (KB/s), IO*IOPSMax/TasksMax plain integers.
    const cg = spec.cgroup;
    const cgField = (field: string, value: number | undefined, suffix: string) => {
      params.set(field, value === undefined ? '' : `${Math.max(0, Math.floor(value))}${suffix}`);
    };
    cgField('CPUQuota', cg?.cpuQuotaPercent, '%');
    cgField('MemoryHigh', cg?.memoryHighMb, 'M');
    cgField('MemoryMax', cg?.memoryMaxMb, 'M');
    cgField('IOReadBandwidthMax', cg?.ioReadBandwidthKbps, 'K');
    cgField('IOWriteBandwidthMax', cg?.ioWriteBandwidthKbps, 'K');
    cgField('IOReadIOPSMax', cg?.ioReadIops, '');
    cgField('IOWriteIOPSMax', cg?.ioWriteIops, '');
    cgField('TasksMax', cg?.tasksMax, '');

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
    // Authoritative NS for the new account's zone. DA only honours these when
    // both are present; otherwise it falls back to the server's NS config.
    if (input.ns1 && input.ns2) {
      body.ns1 = input.ns1;
      body.ns2 = input.ns2;
    }
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
  /**
   * Admin → Admin Settings → ns1/ns2 (zapis do directadmin.conf).
   * DA 1.6x: POST na CMD_API_ADMIN_SETTINGS często zwraca 405 — używamy CMD_ADMIN_SETTINGS.
   */
  async setAdminDefaultNameservers(ns1: string, ns2: string): Promise<void> {
    const payload = await this.buildAdminSettingsSavePayload(ns1, ns2);
    let lastError: unknown;
    for (const path of ['/CMD_ADMIN_SETTINGS', '/CMD_API_ADMIN_SETTINGS'] as const) {
      try {
        const response = await this.client.post(
          path,
          new URLSearchParams(payload).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30_000,
          },
        );
        this.parseDaAdminSettingsSaveResponse(response.data);
        return;
      } catch (err) {
        lastError = err;
        if (this.shouldRetryAdminSettingsOnAlternatePath(err, path)) continue;
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private adminSettingsFormDefaults(ns1: string, ns2: string): Record<string, string> {
    return {
      action: 'save',
      json: 'yes',
      ns1,
      ns2,
      auto_update: 'yes',
      backup_threshold: '90',
      demo_admin: 'no',
      demo_reseller: 'no',
      demo_user: 'no',
      oversell: 'yes',
      service_email_active: 'yes',
      suspend: 'yes',
      user_backup: 'yes',
    };
  }

  private async buildAdminSettingsSavePayload(ns1: string, ns2: string): Promise<Record<string, string>> {
    const defaults = this.adminSettingsFormDefaults(ns1, ns2);
    for (const getPath of ['/CMD_ADMIN_SETTINGS', '/CMD_API_ADMIN_SETTINGS'] as const) {
      try {
        const getRes = await this.client.get(getPath, { params: { json: 'yes' }, timeout: 20_000 });
        const merged = mergeAdminSettingsPayload(getRes.data);
        return { ...merged, ...defaults, ns1, ns2 };
      } catch {
        // try next GET path
      }
    }
    return defaults;
  }

  private shouldRetryAdminSettingsOnAlternatePath(err: unknown, path: string): boolean {
    if (path !== '/CMD_API_ADMIN_SETTINGS') return false;
    const ax = err as { response?: { status?: number; data?: unknown } };
    if (ax.response?.status === 405) return true;
    const body =
      typeof ax.response?.data === 'string'
        ? ax.response.data
        : JSON.stringify(ax.response?.data ?? '');
    return /cannot execute that command/i.test(body);
  }

  private parseDaAdminSettingsSaveResponse(data: unknown): void {
    if (typeof data === 'string') {
      if (/cannot execute that command/i.test(data)) {
        throw new Error('DirectAdmin: CMD_ADMIN_SETTINGS not available for this session');
      }
      this.parseResponse(data);
      return;
    }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      const success = o.success;
      if (success === 'saved' || success === true || success === 'true') return;
      if ('error' in o) {
        const err = o.error;
        if (String(err) !== '0' && String(err) !== 'false') {
          throw new Error(
            `DirectAdmin API Error: ${String(o.text ?? o.details ?? o.message ?? err)}`,
          );
        }
      }
    }
  }

  /**
   * Reseller → Nameservers → domyślne NS dla nowo tworzonych kont użytkowników.
   */
  async setResellerDefaultNameservers(ns1: string, ns2: string): Promise<void> {
    const response = await this.client.post(
      '/CMD_API_NAME_SERVER',
      new URLSearchParams({ action: 'modify', ns1, ns2 }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.parseDaResponseBody(response.data);
  }

  /**
   * NS jednego konta hostingowego bez zmiany pakietu (action=single).
   */
  async setUserNameservers(username: string, ns1: string, ns2: string): Promise<void> {
    const response = await this.client.post(
      '/CMD_API_MODIFY_USER',
      new URLSearchParams({
        action: 'single',
        user: username,
        ns1,
        ns2,
        ns: 'verris',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.parseDaResponseBody(response.data);
  }

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

  /**
   * A1 — request a free Let's Encrypt certificate for a domain (+www), covering
   * the account control panel where applicable. Idempotent: DA renews/replaces
   * the existing cert. The user session (account login key) issues against the
   * account's own domains.
   *
   * Best-effort by design — DNS may not have propagated to the node yet at
   * provisioning time; callers should not fail the whole flow if this throws.
   */
  async requestLetsEncrypt(domain: string, opts: { includeWww?: boolean } = {}): Promise<void> {
    const names = opts.includeWww === false ? domain : `${domain},www.${domain}`;
    await this.client.post(
      '/CMD_API_SSL',
      new URLSearchParams({
        domain,
        action: 'save',
        type: 'create',
        request: 'letsencrypt',
        name: names,
        keysize: 'secp384r1',
        encryption: 'sha256',
        background: 'yes',
        acme_provider: 'letsencrypt',
        le_force: 'yes',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
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
   * A4 — creates a MySQL database + dedicated user in one call (DA tracks it,
   * so quotas and the user's panel stay consistent). `name`/`user` are the
   * SHORT parts; DA prefixes them with the account username (`acct_name`).
   * Returns the full (prefixed) db + user names for the WP config.
   */
  async createMysqlDatabase(input: {
    name: string;
    user: string;
    password: string;
  }): Promise<{ database: string; username: string }> {
    const accountUser = this.usernameForDbPrefix();
    await this.client.post(
      '/CMD_API_DATABASES',
      new URLSearchParams({
        action: 'create',
        name: input.name,
        user: input.user,
        passwd: input.password,
        passwd2: input.password,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return {
      database: `${accountUser}_${input.name}`,
      username: `${accountUser}_${input.user}`,
    };
  }

  /** Account username used by DA as the db/user prefix. */
  private usernameForDbPrefix(): string {
    return this.usernameValue;
  }

  /**
   * Lists MySQL database names for the authenticated (user-level) session.
   * See DirectAdmin user API: CMD_API_DATABASES (list / create / delete).
   */
  async listMysqlDatabases(): Promise<string[]> {
    const paramSets: Array<Record<string, string>> = [
      {},
      { api: 'yes' },
      { json: 'yes' },
      { api: 'yes', json: 'yes' },
    ];
    let lastError: unknown;
    for (const params of paramSets) {
      try {
        const response = await this.client.get('/CMD_API_DATABASES', { params });
        return this.parseMysqlDatabaseList(response.data);
      } catch (err) {
        lastError = this.normalizeDaClientError(err, lastError);
      }
    }
    throw this.normalizeDaClientError(lastError, 'Unable to list MySQL databases');
  }

  /**
   * Lists POP mailboxes for a domain (CMD_API_POP).
   * DA builds differ: `list0` vs `user0`, GET vs POST, with/without `action=list`.
   */
  async listEmailAccounts(
    domain: string,
    options?: { accountUsername?: string },
  ): Promise<Array<{ localPart: string; quotaMb: number | null }>> {
    const domainParam = domain.trim();
    if (!domainParam) return [];

    const getAttempts: Array<Record<string, string>> = [
      { domain: domainParam, action: 'list' },
      { domain: domainParam, action: 'list', json: 'yes' },
      { domain: domainParam, action: 'list', api: 'yes' },
      { domain: domainParam, action: 'list', api: 'yes', json: 'yes' },
      { domain: domainParam, action: 'list', type: 'quota' },
      { domain: domainParam, action: 'list', type: 'quota', json: 'yes' },
    ];

    let lastError: unknown;
    for (const params of getAttempts) {
      try {
        const response = await this.client.get('/CMD_API_POP', { params });
        const rows = params.type === 'quota'
          ? this.parsePopQuotaList(response.data, domainParam)
          : this.parsePopAccountList(response.data, domainParam);
        if (rows.length > 0) return rows;
      } catch (err) {
        lastError = this.normalizeDaClientError(err, lastError);
      }
    }

    const postBodies: Array<Record<string, string>> = [
      { domain: domainParam, action: 'list', api: 'yes', json: 'yes' },
      { domain: domainParam, action: 'list', api: 'yes' },
      { domain: domainParam, action: 'list', type: 'quota', api: 'yes' },
    ];
    for (const form of postBodies) {
      try {
        const body = new URLSearchParams(form).toString();
        const response = await this.client.post('/CMD_API_POP', body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const rows = form.type === 'quota'
          ? this.parsePopQuotaList(response.data, domainParam)
          : this.parsePopAccountList(response.data, domainParam);
        if (rows.length > 0) return rows;
      } catch (err) {
        lastError = this.normalizeDaClientError(err, lastError);
      }
    }

    const fallback = await this.listEmailAccountsUsageFallback(
      domainParam,
      options?.accountUsername,
    );
    if (fallback.length > 0) return fallback;

    if (lastError) {
      throw this.normalizeDaClientError(lastError, 'Unable to list email accounts');
    }
    return [];
  }

  /** Usage counters from CMD_API_SHOW_USER_USAGE (nemails, …). */
  async getUserUsageCounts(): Promise<{ nemails: number }> {
    const response = await this.client.get('/CMD_API_SHOW_USER_USAGE');
    const params = this.daPayloadToParams(response.data);
    const nemails = Number(params.get('nemails') ?? 0);
    return {
      nemails: Number.isFinite(nemails) ? nemails : 0,
    };
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

  private daPayloadToParams(data: unknown): URLSearchParams {
    if (data == null) return new URLSearchParams();
    if (typeof data === 'string') {
      const text = data.trim();
      if (!text || text.startsWith('<')) return new URLSearchParams();
      return new URLSearchParams(text);
    }
    if (typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const err = record.error;
      if (err != null && String(err) !== '0' && String(err) !== 'false') {
        const errText = String(record.text ?? record.details ?? record.message ?? 'Unknown DA error');
        throw new Error(`DirectAdmin API Error: ${errText}`.trim());
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
    return new URLSearchParams();
  }

  private popPayloadIndicatesError(data: unknown): boolean {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const err = (data as Record<string, unknown>).error;
      return err != null && String(err) !== '0' && String(err) !== 'false';
    }
    if (typeof data === 'string') {
      const p = new URLSearchParams(data);
      const err = p.get('error');
      return Boolean(err && err !== '0');
    }
    return false;
  }

  private normalizeDaClientError(err: unknown, fallback: unknown): Error {
    if (err && typeof err === 'object' && 'response' in err) {
      const ax = err as { response?: { data?: unknown }; message?: string };
      const data = ax.response?.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        const result = record.result ?? record.text ?? record.details;
        if (result != null && String(result).trim()) {
          return new Error(String(result).trim());
        }
      }
      if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const result = parsed.result ?? parsed.text ?? parsed.details;
          if (result != null && String(result).trim()) {
            return new Error(String(result).trim());
          }
        } catch {
          /* ignore */
        }
      }
      if (ax.message) return new Error(ax.message);
    }
    if (err instanceof Error) return err;
    if (typeof fallback === 'string') return new Error(fallback);
    if (fallback instanceof Error) return fallback;
    return new Error(String(err ?? fallback ?? 'DirectAdmin request failed'));
  }

  private parsePopAccountList(
    data: unknown,
    domain: string,
  ): Array<{ localPart: string; quotaMb: number | null }> {
    if (Array.isArray(data)) {
      const rows: Array<{ localPart: string; quotaMb: number | null }> = [];
      const seen = new Set<string>();
      for (const item of data) {
        if (item == null) continue;
        const raw = String(item).trim();
        if (!raw) continue;
        const localPart = raw.includes('@') ? raw.split('@')[0]! : raw;
        const key = `${localPart.toLowerCase()}@${domain.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ localPart, quotaMb: null });
      }
      return rows;
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      if (!('error' in record) || String(record.error ?? '0') === '0') {
        const rows: Array<{ localPart: string; quotaMb: number | null }> = [];
        const seen = new Set<string>();
        const domainLower = domain.toLowerCase();
        for (const [key, value] of Object.entries(record)) {
          if (['error', 'text', 'details', 'success', 'domain', 'action', 'result'].includes(key)) {
            continue;
          }
          const raw = value == null ? key : String(value).trim() || key;
          const localPart = raw.includes('@') ? raw.split('@')[0]! : raw;
          if (!localPart || localPart.includes('.')) continue;
          const emailKey = `${localPart.toLowerCase()}@${domainLower}`;
          if (seen.has(emailKey)) continue;
          seen.add(emailKey);
          rows.push({ localPart, quotaMb: null });
        }
        if (rows.length > 0) return rows;
      }
    }

    const params = this.daPayloadToParams(data);
    const rows: Array<{ localPart: string; quotaMb: number | null }> = [];
    const seen = new Set<string>();
    const domainLower = domain.toLowerCase();

    const pushLocal = (raw: string, idx: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const localPart = trimmed.includes('@')
        ? trimmed.split('@')[0]!
        : trimmed;
      const emailKey = `${localPart.toLowerCase()}@${domainLower}`;
      if (seen.has(emailKey)) return;
      seen.add(emailKey);
      const quotaRaw = params.get(`quota${idx}`) ?? params.get(`Quota${idx}`);
      rows.push({
        localPart,
        quotaMb: quotaRaw && !Number.isNaN(Number(quotaRaw)) ? Number(quotaRaw) : null,
      });
    };

    const indexes = new Set<string>();
    for (const key of params.keys()) {
      const m = /^(list|user)(\d+)$/i.exec(key);
      if (m) indexes.add(m[2]!);
    }
    for (const idx of [...indexes].sort((a, b) => Number(a) - Number(b))) {
      const v = params.get(`list${idx}`) ?? params.get(`List${idx}`) ?? params.get(`user${idx}`) ?? params.get(`User${idx}`);
      if (v) pushLocal(v, idx);
    }

    if (rows.length > 0) return rows;

    for (const [key, value] of params.entries()) {
      if (!value.trim()) continue;
      if (['error', 'text', 'details', 'success', 'domain', 'action'].includes(key)) continue;
      if (/^(list|user)\d+$/i.test(key)) pushLocal(value, key.replace(/\D/g, ''));
    }

    return rows;
  }

  /**
   * DA Evolution sometimes leaves mailboxes in /etc/virtual/{domain}/passwd while
   * CMD_API_POP action=list returns []. When usage reports nemails>0, expose the
   * default account mailbox ({daUsername}@domain) created at provisioning.
   */
  private async listEmailAccountsUsageFallback(
    domain: string,
    accountUsername?: string,
  ): Promise<Array<{ localPart: string; quotaMb: number | null }>> {
    const owner = accountUsername?.trim().toLowerCase();
    if (!owner) return [];
    try {
      const usage = await this.getUserUsageCounts();
      if (usage.nemails <= 0) return [];
      return [{ localPart: owner, quotaMb: null }];
    } catch {
      return [];
    }
  }

  /** POP list with type=quota — each listN is a urlencoded user=…&quota=… string. */
  private parsePopQuotaList(
    data: unknown,
    domain: string,
  ): Array<{ localPart: string; quotaMb: number | null }> {
    const params = this.daPayloadToParams(data);
    if (params.get('error') && params.get('error') !== '0') {
      return [];
    }
    const rows: Array<{ localPart: string; quotaMb: number | null }> = [];
    const seen = new Set<string>();
    const domainLower = domain.toLowerCase();

    const pushParsed = (chunk: string) => {
      const trimmed = chunk.trim();
      if (!trimmed) return;
      const inner = trimmed.includes('=') ? new URLSearchParams(trimmed) : null;
      const user = inner?.get('user') ?? inner?.get('email') ?? trimmed.split('@')[0] ?? trimmed;
      const localPart = user.includes('@') ? user.split('@')[0]! : user;
      if (!localPart) return;
      const key = `${localPart.toLowerCase()}@${domainLower}`;
      if (seen.has(key)) return;
      seen.add(key);
      const quotaRaw = inner?.get('quota');
      rows.push({
        localPart,
        quotaMb:
          quotaRaw != null && quotaRaw !== '' && !Number.isNaN(Number(quotaRaw))
            ? Number(quotaRaw)
            : null,
      });
    };

    for (const [key, value] of params.entries()) {
      if (/^list\d+$/i.test(key)) pushParsed(value);
    }
    return rows;
  }

  private parseMysqlDatabaseList(data: unknown): string[] {
    if (Array.isArray(data)) {
      const names: string[] = [];
      const seen = new Set<string>();
      for (const item of data) {
        const name = String(item ?? '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
      return names;
    }
    if (typeof data === 'string' && data.trim().startsWith('<')) {
      return [];
    }
    const params = this.daPayloadToParams(data);
    const names: string[] = [];
    const seen = new Set<string>();
    for (const [key, value] of params.entries()) {
      if (!value || !value.trim()) continue;
      if (/^list\d+$/i.test(key) || /^name\d+$/i.test(key) || /^database\d+$/i.test(key)) {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    if (names.length > 0) return names;
    for (const [key, value] of params.entries()) {
      if (!value.trim()) continue;
      if (['error', 'text', 'details', 'success', 'info'].includes(key)) continue;
      if (/^db\S*$/i.test(key) || key.toLowerCase() === 'database') {
        if (!seen.has(value)) {
          seen.add(value);
          names.push(value);
        }
      }
    }
    if (names.length > 0) return names;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (['error', 'text', 'details', 'success', 'info'].includes(key)) continue;
        if (typeof value === 'object') continue;
        if (key.includes('_') && /^[a-z0-9_]+$/i.test(key)) {
          if (!seen.has(key)) {
            seen.add(key);
            names.push(key);
          }
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

  /** Obsługa odpowiedzi tekstowej lub JSON (json=yes). */
  private parseDaResponseBody(data: unknown): void {
    if (typeof data === 'string') {
      this.parseResponse(data);
      return;
    }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if ('error' in o) {
        const err = o.error;
        if (String(err) !== '0' && String(err) !== 'false') {
          throw new Error(
            `DirectAdmin API Error: ${String(o.text ?? o.details ?? o.message ?? err)}`,
          );
        }
      }
    }
  }
}

const ADMIN_SETTINGS_SKIP_KEYS = new Set([
  'error',
  'text',
  'details',
  'success',
  'result',
  'timezones',
  'json',
]);

/** Wyciąga pola formularza Admin Settings do POST action=save. */
/** Ensures a path begins with exactly one leading slash. */
function ensureLeadingSlash(path: string): string {
  return `/${path.replace(/^\/+/, '')}`;
}

/** Removes a single trailing slash (keeps "/" as-is). */
function stripTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function mergeAdminSettingsPayload(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof data === 'string') {
    const params = new URLSearchParams(data);
    for (const [key, value] of params.entries()) {
      if (!ADMIN_SETTINGS_SKIP_KEYS.has(key)) out[key] = value;
    }
    return out;
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const root = data as Record<string, unknown>;
    const nested = root.server_settings ?? root.serverSettings ?? root.config;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const [key, value] of Object.entries(nested)) {
        if (value != null && typeof value !== 'object') out[key] = String(value);
      }
    }
    for (const [key, value] of Object.entries(root)) {
      if (ADMIN_SETTINGS_SKIP_KEYS.has(key)) continue;
      if (value != null && typeof value !== 'object') out[key] = String(value);
    }
  }
  return out;
}

/**
 * Accepts either a full {@link DaPackageSpec} or the legacy disk-only input and
 * always returns a complete spec. Legacy callers (disk quota only) get a
 * conservative limited package: a real disk quota (number, no `uquota`),
 * generous but bounded e-mail/db/ftp counts and unlimited bandwidth — never
 * the old "everything unlimited" payload.
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

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as dns from 'dns';
import * as tls from 'tls';
import type {
  AuditCheckDto,
  AuditCheckStatus,
  AuditRecordField,
  DocAttestation,
  NodeAuditReportDto,
  NodeRepairResultDto,
} from '@verris/contracts';
import { Plan, Server, ServerStatus } from '@verris/database';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from './directadmin.service';
import { NodeTasksService } from './node-tasks.service';
import {
  DA_DEFAULT_LANGUAGE,
  buildDaPackageSpecFromPlan,
  planResourceFields,
} from './da-package-spec';

const WILDCARD_TLS_SAN = '*.verris.pl';
const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;
/** CageFS status is reported by verris-lve.timer (~60 s); allow generous slack. */
const CAGEFS_FRESH_MS = 10 * 60 * 1000;

/**
 * Verris "wzorzec walidatora": for every action a node performs, prove the
 * effect exists (phase 1) and that it matches the Verris `Plan` + vendor
 * documentation (phase 2), then report concrete records to the admin. The
 * same engine powers both the wizard verifiers and the node audit/repair UI.
 *
 * Repairs are classified by invasiveness (safe/caution/danger); only `safe`
 * runs without an explicit confirmation, and `danger` requires echoing the
 * server name. Nothing destructive ever runs automatically.
 */
@Injectable()
export class NodeAuditService {
  private readonly logger = new Logger(NodeAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
    private readonly nodeTasks: NodeTasksService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async runAudit(serverId: string): Promise<NodeAuditReportDto> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    const plans = await this.loadManagedPlans();

    const checks: AuditCheckDto[] = [];
    checks.push(await this.checkAgent(server));
    checks.push(this.checkCagefs(server));
    checks.push(await this.checkHostname(server));
    checks.push(await this.checkDns(server));
    checks.push(await this.checkDaHost(server));

    const daClient = await this.tryDaClient(serverId);
    checks.push(this.checkDaConnectivityResult(server, daClient));
    if (daClient.client) {
      for (const plan of plans) {
        checks.push(await this.checkDaPackage(daClient.client, plan));
      }
      checks.push(await this.checkDaIpRegistered(server, daClient.client));
    }
    checks.push(this.checkHardening(server));
    checks.push(await this.checkTls(server));

    return {
      serverId: server.id,
      serverName: server.name,
      generatedAt: new Date().toISOString(),
      status: worstStatus(checks.map((c) => c.status)),
      stackVersions: {
        directadmin: null,
        cloudlinux: server.cagefsEnabled === true ? 'CageFS enabled' : null,
        litespeed: null,
        agent: server.agentVersion,
      },
      checks,
    };
  }

  async runRepair(
    serverId: string,
    actionId: string,
    actorUserId: string,
    input: { confirm?: string } = {},
  ): Promise<NodeRepairResultDto> {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');

    if (actionId === 'repair-da-host') {
      return this.repairDaHost(server, actorUserId);
    }
    if (actionId === 'repair-cagefs-enable') {
      return this.repairCagefsEnable(server, actorUserId);
    }
    if (actionId.startsWith('repair-da-package-')) {
      const slug = actionId.replace('repair-da-package-', '');
      return this.repairDaPackage(server, slug, actorUserId);
    }
    throw new BadRequestException(`Nieznana akcja naprawy: ${actionId}`);
  }

  // ---------------------------------------------------------------------------
  // Checks
  // ---------------------------------------------------------------------------

  private async checkAgent(server: Server): Promise<AuditCheckDto> {
    const hasToken = Boolean(server.identityToken);
    const heartbeat = server.lastHeartbeatAt ?? server.lastHandshakeAt;
    const fresh = heartbeat ? Date.now() - heartbeat.getTime() < HEARTBEAT_FRESH_MS : false;
    const records: AuditRecordField[] = [
      { label: 'Status węzła', actual: server.status, ok: server.status === ServerStatus.ACTIVE },
      { label: 'Identity token agenta', actual: hasToken ? 'ustawiony' : 'brak', ok: hasToken },
      {
        label: 'Ostatni heartbeat',
        actual: heartbeat ? heartbeat.toISOString() : 'brak',
        ok: fresh,
      },
    ];
    let status: AuditCheckStatus = 'OK';
    let summary = 'Agent węzła odpowiada — telemetria świeża.';
    if (!hasToken) {
      status = 'FAIL';
      summary = 'Węzeł nie ma agenta (brak identity token). Uruchom bootstrap ponownie.';
    } else if (!heartbeat) {
      status = 'WARN';
      summary = 'Brak danych o heartbeat — poczekaj na pierwszy cykl agenta (1 min).';
    } else if (!fresh) {
      status = 'WARN';
      summary = 'Ostatni heartbeat starszy niż 5 min — sprawdź verris-lve.timer na węźle.';
    }
    return {
      id: 'node-agent',
      title: 'Agent i telemetria',
      category: 'AGENT',
      status,
      summary,
      records,
      docAttestation: [
        {
          vendor: 'Verris',
          statement:
            'Agent (verris-lve.timer) wysyła telemetrię LVE z /proc/lve/list co 60 s i egzekwuje limity planów/kont przez lvectl; identity token wydawany jednorazowo przy handshake.',
          reference: 'ops/docs/NODE_BOOTSTRAP_V2.md',
        },
      ],
      repair: null,
    };
  }

  private checkCagefs(server: Server): AuditCheckDto {
    const checkedAt = server.cagefsCheckedAt;
    const fresh = checkedAt ? Date.now() - checkedAt.getTime() < CAGEFS_FRESH_MS : false;
    const enabled = server.cagefsEnabled === true;
    const count = server.cagefsEnabledCount;

    let status: AuditCheckStatus;
    let summary: string;
    if (!checkedAt || !fresh) {
      status = 'UNKNOWN';
      summary = checkedAt
        ? `Agent nie zgłosił statusu CageFS od ${checkedAt.toISOString()} — sprawdź verris-lve.timer na węźle.`
        : 'Agent nie zgłosił jeszcze statusu CageFS — poczekaj na cykl agenta (1 min) lub zaktualizuj agenta.';
    } else if (enabled) {
      status = 'OK';
      summary = `CageFS aktywny — konta izolowane, integracja LVE w DirectAdmin działa${
        count != null ? ` (kont w klatce: ${count})` : ''
      }.`;
    } else {
      status = 'FAIL';
      summary =
        'CageFS nieaktywny — DirectAdmin spada na limity systemd-cgroup zamiast pełnej izolacji i integracji LVE. Uruchom profil hostingowy (instaluje i włącza CageFS).';
    }

    const canRepair =
      checkedAt != null &&
      fresh &&
      !enabled &&
      server.status === ServerStatus.ACTIVE &&
      Boolean(server.identityToken);

    return {
      id: 'cagefs',
      title: 'CloudLinux CageFS',
      category: 'CAGEFS',
      status,
      summary,
      records: [
        {
          label: 'CageFS (cagefsctl --cagefs-status)',
          expected: 'enabled',
          actual: checkedAt ? (enabled ? 'enabled' : 'disabled') : 'brak danych',
          ok: enabled && fresh,
        },
        { label: 'Kont w klatce (--list-enabled)', actual: count != null ? String(count) : '—' },
        { label: 'Ostatni raport agenta', actual: checkedAt ? checkedAt.toISOString() : 'brak' },
      ],
      docAttestation: [
        {
          vendor: 'CloudLinux',
          statement:
            'CageFS (cagefsctl --init + --enable-all) izoluje każde konto we własnym wirtualnym FS i jest warunkiem integracji LVE w DirectAdmin (limity pakietów/LVE egzekwowane przez panel). Bez CageFS DA używa limitów systemd-cgroup.',
          reference: 'https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#cagefs',
          verifiedAt: '2026-05-31',
        },
      ],
      repair: canRepair
        ? {
            actionId: 'repair-cagefs-enable',
            risk: 'caution',
            label: 'Zainstaluj/włącz CageFS (profil hostingowy)',
            description:
              'Zleci profil hostingowy na węźle, który zainstaluje pakiet cagefs, wykona cagefsctl --init oraz --enable-all (izolacja wszystkich kont). Operacja idempotentna; --init może potrwać kilka minut. Postęp i log widoczne w sekcji „Profil hostingowy”.',
            requiresConfirmation: true,
            confirmValue: null,
            warning:
              'Pierwsza inicjalizacja CageFS przebudowuje skeleton i może chwilowo obciążyć węzeł; wszystkie konta zostaną wprowadzone do klatki (caged).',
          }
        : null,
    };
  }

  private async checkHostname(server: Server): Promise<AuditCheckDto> {
    const hostname = server.hostname?.trim() ?? '';
    const ok = hostname.length > 0 && hostname.includes('.');
    return {
      id: 'node-hostname',
      title: 'Hostname węzła',
      category: 'HOSTNAME',
      status: ok ? 'OK' : 'FAIL',
      summary: ok
        ? `Hostname ustawiony: ${hostname}`
        : 'Brak hostname (FQDN) węzła — wymagany do TLS i linków panelu klienta.',
      records: [
        { label: 'Hostname (FQDN)', expected: 'np. node-pl-02.verris.pl', actual: hostname || 'brak', ok },
        { label: 'IP węzła', actual: server.ipAddress },
      ],
      docAttestation: [
        {
          vendor: 'Verris',
          statement:
            'Linki panelu klienta i certyfikat wildcard działają po hostname, nie po surowym IP (CN/SAN = *.verris.pl).',
          reference: 'ops/docs/NODE_WILDCARD_TLS.md',
        },
      ],
      repair: null,
    };
  }

  private async checkDns(server: Server): Promise<AuditCheckDto> {
    const hostname = server.hostname?.trim() ?? '';
    if (!hostname) {
      return {
        id: 'node-dns',
        title: 'Rekord DNS A',
        category: 'DNS',
        status: 'UNKNOWN',
        summary: 'Brak hostname — nie można sprawdzić rekordu A.',
        records: [],
        docAttestation: [],
        repair: null,
      };
    }
    let resolved: string[] = [];
    let resolveError: string | null = null;
    try {
      resolved = await dns.promises.resolve4(hostname);
    } catch (err) {
      resolveError = err instanceof Error ? err.message : String(err);
    }
    const matches = resolved.includes(server.ipAddress);
    let status: AuditCheckStatus = 'OK';
    let summary = `Rekord A ${hostname} → ${server.ipAddress} jest poprawny.`;
    if (resolveError) {
      status = 'FAIL';
      summary = `Hostname ${hostname} nie rozwiązuje się w DNS (${resolveError}). Dodaj rekord A w OVH.`;
    } else if (!matches) {
      status = 'WARN';
      summary = `Rekord A ${hostname} wskazuje ${resolved.join(', ') || 'brak'} zamiast ${server.ipAddress}.`;
    }
    return {
      id: 'node-dns',
      title: 'Rekord DNS A',
      category: 'DNS',
      status,
      summary,
      records: [
        { label: 'Hostname', actual: hostname },
        { label: 'Oczekiwane IP', expected: server.ipAddress, actual: resolved.join(', ') || 'brak', ok: matches },
      ],
      docAttestation: [
        {
          vendor: 'Verris',
          statement: 'Rekord A węzła jest zarządzany ręcznie w OVH (lub OVH API) — patrz runbook.',
          reference: 'ops/docs/OVH_WILDCARD_TLS_SETUP.md',
        },
      ],
      repair: null,
    };
  }

  private async checkDaHost(server: Server): Promise<AuditCheckDto> {
    const hostname = server.hostname?.trim() ?? '';
    const daHost = server.daHost?.trim() ?? '';
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(daHost);
    const matchesHostname = hostname.length > 0 && daHost === hostname;
    const ok = matchesHostname && !isIp;
    const canRepair = hostname.length > 0 && !matchesHostname;

    let status: AuditCheckStatus = 'OK';
    let summary = `daHost wskazuje hostname (${daHost}).`;
    if (!daHost) {
      status = 'WARN';
      summary = 'DirectAdmin nie jest jeszcze skonfigurowany (brak daHost).';
    } else if (isIp) {
      status = 'WARN';
      summary = `daHost to surowe IP (${daHost}) — linki panelu klienta będą po IP zamiast hostname.`;
    } else if (!matchesHostname && hostname) {
      status = 'WARN';
      summary = `daHost (${daHost}) różni się od hostname (${hostname}).`;
    }

    return {
      id: 'da-host',
      title: 'DA host = hostname',
      category: 'HOSTNAME',
      status,
      summary,
      records: [
        { label: 'daHost (DB)', expected: hostname || '(ustaw hostname)', actual: daHost || 'brak', ok },
        { label: 'Hostname węzła', actual: hostname || 'brak' },
      ],
      docAttestation: [
        {
          vendor: 'Verris',
          statement:
            'hostingPanelBaseUrl() preferuje server.hostname — daHost powinien być hostnamem, nie IP, by TLS wildcard działał.',
          reference: 'apps/api/src/servers/directadmin.service.ts',
        },
      ],
      repair: canRepair
        ? {
            actionId: 'repair-da-host',
            risk: 'safe',
            label: 'Ustaw daHost = hostname',
            description: `Zaktualizuje pole daHost w bazie na "${hostname}". Nie zmienia konfiguracji na węźle — wpływa tylko na linki panelu i adres testu DA API.`,
            requiresConfirmation: false,
            confirmValue: null,
            warning: null,
          }
        : null,
    };
  }

  private checkDaConnectivityResult(
    server: Server,
    daClient: { client: DirectAdminClient | null; error: string | null; scope: DaScopeProbe | null },
  ): AuditCheckDto {
    if (!daClient.client) {
      return {
        id: 'da-connectivity',
        title: 'Łączność i login key DA',
        category: 'DA_CONNECTIVITY',
        status: server.daPasswordEnc ? 'FAIL' : 'WARN',
        summary: server.daPasswordEnc
          ? `Nie udało się połączyć z DirectAdmin: ${daClient.error ?? 'brak szczegółów'}`
          : 'DirectAdmin nie jest skonfigurowany (brak login key).',
        records: [
          { label: 'daHost:port', actual: `${server.daHost ?? '—'}:${server.daPort ?? '—'}` },
          { label: 'Login key', actual: server.daPasswordEnc ? 'ustawiony' : 'brak', ok: Boolean(server.daPasswordEnc) },
          { label: 'Błąd', actual: daClient.error ?? null },
        ],
        docAttestation: [],
        repair: null,
      };
    }

    const scope = daClient.scope!;
    const packagesOk = scope.packagesOk;
    const accountsOk = scope.accountsOk;
    const ok = packagesOk && accountsOk;
    return {
      id: 'da-connectivity',
      title: 'Łączność i login key DA',
      category: 'DA_CONNECTIVITY',
      status: ok ? 'OK' : 'FAIL',
      summary: ok
        ? 'DirectAdmin API odpowiada; login key ma uprawnienia do pakietów i kont.'
        : 'Login key DA nie ma wymaganego zakresu (packages + accounts). Wygeneruj klucz z pełnym scope.',
      records: [
        { label: 'CMD_API_PACKAGES_USER', expected: 'dostępne', actual: packagesOk ? 'OK' : (scope.packagesError ?? 'błąd'), ok: packagesOk },
        { label: 'CMD_API_SHOW_USERS', expected: 'dostępne', actual: accountsOk ? 'OK' : (scope.accountsError ?? 'błąd'), ok: accountsOk },
        { label: 'Liczba pakietów', actual: scope.packageCount != null ? String(scope.packageCount) : '—' },
      ],
      docAttestation: [
        {
          vendor: 'DirectAdmin',
          statement:
            'Provisioning wymaga login key ze scope packages + accounts (CMD_API_MANAGE_USER_PACKAGES, CMD_API_ACCOUNT_USER).',
          reference: 'https://docs.directadmin.com/developer/api/login-keys.html',
        },
      ],
      repair: null,
    };
  }

  private async checkDaPackage(client: DirectAdminClient, plan: Plan): Promise<AuditCheckDto> {
    const spec = buildDaPackageSpecFromPlan(planResourceFields(plan));
    const id = `da-package-${plan.slug}`;
    let info: Record<string, string> | null = null;
    let readError: string | null = null;
    try {
      info = await client.getUserPackageInfo(plan.slug);
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
    }

    const exists = info != null && Object.keys(info).length > 0 && !isAllEmpty(info);
    if (!exists) {
      return {
        id,
        title: `Pakiet DA: ${plan.slug}`,
        category: 'DA_PACKAGES',
        status: 'FAIL',
        summary: readError
          ? `Nie udało się odczytać pakietu ${plan.slug}: ${readError}`
          : `Pakiet ${plan.slug} nie istnieje na węźle — utwórz z limitami planu.`,
        records: [{ label: 'Pakiet', expected: plan.slug, actual: 'brak', ok: false }],
        docAttestation: this.daPackageAttestation(),
        repair: this.daPackageRepair(plan.slug, 'caution'),
      };
    }

    const records: AuditRecordField[] = [];
    const quotaActual = info!['quota'] ?? '';
    const quotaUnlimited = isUnlimited(quotaActual);
    const quotaOk =
      spec.diskQuotaMb === 'unlimited'
        ? quotaUnlimited
        : !quotaUnlimited && numEq(quotaActual, spec.diskQuotaMb);
    records.push({
      label: 'Dysk (quota MB)',
      expected: spec.diskQuotaMb === 'unlimited' ? 'Bez ograniczeń' : String(spec.diskQuotaMb),
      actual: quotaUnlimited ? 'Bez ograniczeń' : quotaActual,
      ok: quotaOk,
    });

    const bwActual = info!['bandwidth'] ?? '';
    const bwUnlimited = isUnlimited(bwActual);
    const bwOk =
      spec.bandwidthMb === 'unlimited' ? bwUnlimited : !bwUnlimited && numEq(bwActual, spec.bandwidthMb as number);
    records.push({
      label: 'Transfer (bandwidth MB)',
      expected: spec.bandwidthMb === 'unlimited' ? 'Bez ograniczeń' : String(spec.bandwidthMb),
      actual: bwUnlimited ? 'Bez ograniczeń' : bwActual,
      ok: bwOk,
    });

    const langActual = (info!['language'] ?? '').toLowerCase();
    const langOk = langActual === DA_DEFAULT_LANGUAGE;
    records.push({ label: 'Język panelu', expected: DA_DEFAULT_LANGUAGE, actual: langActual || 'brak', ok: langOk });

    const lve = spec.lve!;
    const lveChecks: Array<[string, string, number | undefined]> = [
      ['CPU %', 'cpu', lve.cpuPercent],
      ['Pamięć (MB)', 'mem', lve.memoryMb],
      ['IO (KB/s)', 'io', lve.ioKbps],
      ['IOPS', 'iops', lve.iops],
      ['Entry processes', 'ep', lve.entryProcesses],
      ['NPROC', 'nproc', lve.nproc],
    ];
    let lveMismatch = false;
    for (const [label, field, expected] of lveChecks) {
      if (expected === undefined) continue;
      const actual = info![field];
      if (actual === undefined) continue;
      const ok = numEq(actual, expected);
      if (!ok) lveMismatch = true;
      records.push({ label: `LVE ${label}`, expected: String(expected), actual, ok });
    }

    // DirectAdmin systemd-cgroup limits (active limiter on non-LVE-integrated
    // nodes). Blank = "Bez ograniczeń" → hardFail. Values carry suffixes
    // (100%, 1024M, 10240K), so compare the leading numeric part.
    const cg = spec.cgroup;
    const cgChecks: Array<[string, string, number | undefined]> = cg
      ? [
          ['CPUQuota %', 'CPUQuota', cg.cpuQuotaPercent],
          ['MemoryMax (MB)', 'MemoryMax', cg.memoryMaxMb],
          ['IO read (KB/s)', 'IOReadBandwidthMax', cg.ioReadBandwidthKbps],
          ['IO write (KB/s)', 'IOWriteBandwidthMax', cg.ioWriteBandwidthKbps],
          ['IOPS read', 'IOReadIOPSMax', cg.ioReadIops],
          ['IOPS write', 'IOWriteIOPSMax', cg.ioWriteIops],
          ['Tasks max', 'TasksMax', cg.tasksMax],
        ]
      : [];
    let cgroupUnlimited = false;
    let cgroupMismatch = false;
    for (const [label, field, expected] of cgChecks) {
      if (expected === undefined) continue;
      const actual = info![field];
      const blank = !actual || actual.trim() === '';
      const ok = !blank && cgroupNumEq(actual, expected);
      if (blank) cgroupUnlimited = true;
      else if (!ok) cgroupMismatch = true;
      records.push({
        label: `cgroup ${label}`,
        expected: String(expected),
        actual: blank ? 'Bez ograniczeń' : actual!,
        ok,
      });
    }

    const hardFail = !quotaOk || !bwOk || cgroupUnlimited;
    const softWarn = !langOk || lveMismatch || cgroupMismatch;
    const status: AuditCheckStatus = hardFail ? 'FAIL' : softWarn ? 'WARN' : 'OK';
    let summary: string;
    if (hardFail) {
      summary = `Pakiet ${plan.slug}: dysk/transfer/cgroups są "Bez ograniczeń" lub nie zgadzają się z planem — napraw.`;
    } else if (softWarn) {
      summary = `Pakiet ${plan.slug}: limity dysku/transferu OK, ale język, LVE lub cgroups wymagają korekty.`;
    } else {
      summary = `Pakiet ${plan.slug} zgodny z planem (limity nie są "Bez ograniczeń", język ${DA_DEFAULT_LANGUAGE}).`;
    }

    return {
      id,
      title: `Pakiet DA: ${plan.slug}`,
      category: 'DA_PACKAGES',
      status,
      summary,
      records,
      docAttestation: this.daPackageAttestation(),
      repair: status === 'OK' ? null : this.daPackageRepair(plan.slug, 'caution'),
    };
  }

  /**
   * Audit F-07: provisioning calls `CMD_API_ACCOUNT_USER` with
   * `ip=<server.ipAddress>` — the public IP must be registered in DA's IP
   * manager (node-onboard-live.sh does this), otherwise account creation
   * fails with "A valid IP was not provided".
   */
  private async checkDaIpRegistered(
    server: Server,
    client: DirectAdminClient,
  ): Promise<AuditCheckDto> {
    const publicIp = server.ipAddress?.trim() ?? '';
    const hasRealIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(publicIp);

    let ips: string[] = [];
    let fetchError: string | null = null;
    try {
      ips = await client.listServerIps();
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const registered = hasRealIp && ips.includes(publicIp);
    let status: AuditCheckStatus = 'OK';
    let summary = `Publiczne IP ${publicIp} jest zarejestrowane w DirectAdmin (IP manager).`;
    if (!hasRealIp) {
      status = 'WARN';
      summary = `Węzeł nie ma jeszcze publicznego IP w panelu (ipAddress="${publicIp}") — uruchom bootstrap/handshake.`;
    } else if (fetchError) {
      status = 'UNKNOWN';
      summary = `Nie udało się pobrać listy IP z DA (${fetchError}).`;
    } else if (!registered) {
      status = 'FAIL';
      summary =
        `IP ${publicIp} NIE jest zarejestrowane w DA — provisioning kont zakończy się błędem ` +
        `„A valid IP was not provided". Uruchom node-onboard-live.sh (Faza 3 wizarda) lub dodaj IP ` +
        `w DA → Admin → IP Manager.`;
    }

    return {
      id: 'da-ip-registered',
      title: 'Publiczne IP w DirectAdmin',
      category: 'DA_IP',
      status,
      summary,
      records: [
        { label: 'IP węzła (panel)', actual: publicIp || '—', ok: hasRealIp },
        {
          label: 'IP w DA IP manager',
          expected: publicIp || '—',
          actual: fetchError ? `błąd: ${fetchError}` : ips.join(', ') || 'brak',
          ok: registered,
        },
      ],
      docAttestation: [
        {
          vendor: 'DirectAdmin',
          statement:
            'CMD_API_ACCOUNT_USER z ip= wymaga IP obecnego w konfiguracji IP serwera (single-IP node: publiczne IP, nie `shared`).',
          reference: 'ops/docs/NODE_ONBOARD_RUNBOOK.md',
        },
      ],
      repair: null,
    };
  }

  /**
   * Audit F-07: LIVE onboarding hardening (security-hardening-baseline.sh +
   * egress lockdown). The verris-lve agent reports the /etc/verris-hardened
   * marker every cycle (`node.hardened`).
   */
  private checkHardening(server: Server): AuditCheckDto {
    const checkedAt = server.hardenedCheckedAt;
    const fresh = checkedAt
      ? Date.now() - checkedAt.getTime() < HEARTBEAT_FRESH_MS
      : false;
    const hardened = server.hardenedEnabled === true;

    let status: AuditCheckStatus = 'UNKNOWN';
    let summary =
      'Brak raportu hardeningu z agenta — zaktualizuj agenta (verris-lve) lub poczekaj na cykl (1 min).';
    if (checkedAt && hardened) {
      status = 'OK';
      summary = 'Security hardening wykonany (marker /etc/verris-hardened raportowany przez agenta).';
    } else if (checkedAt && !hardened && fresh) {
      status = 'FAIL';
      summary =
        'Węzeł NIE przeszedł hardeningu LIVE — uruchom node-onboard-live.sh (baseline + egress lockdown) ' +
        'zanim trafią na niego płacący klienci.';
    } else if (checkedAt && !fresh) {
      status = 'WARN';
      summary = 'Raport hardeningu nieświeży — sprawdź verris-lve.timer na węźle.';
    }

    return {
      id: 'security-hardening',
      title: 'Security hardening (LIVE onboarding)',
      category: 'SECURITY',
      status,
      summary,
      records: [
        {
          label: 'Marker /etc/verris-hardened',
          expected: 'obecny',
          actual: checkedAt ? (hardened ? 'obecny' : 'BRAK') : 'brak raportu',
          ok: hardened,
        },
        { label: 'Ostatni raport', actual: checkedAt?.toISOString() ?? 'brak' },
      ],
      docAttestation: [
        {
          vendor: 'Verris',
          statement:
            'Onboard LIVE (Faza 3): security-hardening-baseline.sh + security-egress-lockdown.sh są obowiązkowe przed klientami.',
          reference: 'ops/docs/NODE_ONBOARD_RUNBOOK.md',
        },
      ],
      repair: null,
    };
  }

  private async checkTls(server: Server): Promise<AuditCheckDto> {
    const host = server.hostname?.trim() || server.daHost?.trim() || '';
    const port = server.daPort ?? 2222;
    if (!host) {
      return {
        id: 'da-tls',
        title: 'Certyfikat TLS panelu DA',
        category: 'TLS',
        status: 'UNKNOWN',
        summary: 'Brak hostname/daHost — nie można sprawdzić certyfikatu.',
        records: [],
        docAttestation: [],
        repair: null,
      };
    }
    let cert: tls.PeerCertificate | null = null;
    let connError: string | null = null;
    try {
      cert = await readPeerCertificate(host, port);
    } catch (err) {
      connError = err instanceof Error ? err.message : String(err);
    }

    const sans = cert?.subjectaltname ?? '';
    const rawCn = cert?.subject?.CN ?? '';
    const cn = Array.isArray(rawCn) ? rawCn.join(', ') : rawCn;
    const coversWildcard = sans.includes(WILDCARD_TLS_SAN) || cn === WILDCARD_TLS_SAN;
    const coversHost = sans.includes(host);
    const ok = Boolean(cert) && (coversWildcard || coversHost);

    let status: AuditCheckStatus = 'OK';
    let summary = `Certyfikat na :${port} pokrywa ${coversWildcard ? WILDCARD_TLS_SAN : host}.`;
    if (connError) {
      status = 'WARN';
      summary = `Nie udało się odczytać certyfikatu z ${host}:${port} (${connError}).`;
    } else if (!ok) {
      status = 'WARN';
      summary = `Certyfikat na :${port} nie pokrywa ${WILDCARD_TLS_SAN} ani ${host} (prawdopodobnie self-signed).`;
    }

    // Audit F-04: a node left with disabled cert verification is a standing
    // MITM exposure for the DA admin login key — always FAIL until fixed.
    if (server.daAllowInvalidCert) {
      status = 'FAIL';
      summary =
        `Weryfikacja certyfikatu DA jest WYŁĄCZONA (daAllowInvalidCert) — połączenie API↔DA ` +
        `podatne na MITM. Wdroż certyfikat na :${port} (verris-node-wildcard-tls.sh / ` +
        `node-directadmin-tls-http01.sh) i wyłącz opcję w konfiguracji DA węzła.`;
    }

    return {
      id: 'da-tls',
      title: 'Certyfikat TLS panelu DA',
      category: 'TLS',
      status,
      summary,
      records: [
        { label: 'Host:port', actual: `${host}:${port}` },
        { label: 'CN', actual: cn || '—' },
        { label: 'SAN', expected: WILDCARD_TLS_SAN, actual: sans || '—', ok },
        { label: 'Ważny do', actual: cert?.valid_to ?? '—' },
        {
          label: 'Weryfikacja cert w API',
          expected: 'włączona',
          actual: server.daAllowInvalidCert ? 'WYŁĄCZONA (escape hatch)' : 'włączona',
          ok: !server.daAllowInvalidCert,
        },
      ],
      docAttestation: [
        {
          vendor: 'Verris',
          statement:
            'Wildcard *.verris.pl wystawiany centralnie na control-plane (DNS-01 OVH) i wgrywany na :2222 węzła — nie obejmuje surowego IP.',
          reference: 'ops/docs/NODE_WILDCARD_TLS.md',
        },
      ],
      // TLS deploy odbywa się z control-plane (SSH + skrypt) — nie automatyzujemy
      // tego z API. Operator uruchamia verris-node-wildcard-tls.sh --node=...
      repair: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Repairs
  // ---------------------------------------------------------------------------

  private async repairDaHost(server: Server, actorUserId: string): Promise<NodeRepairResultDto> {
    const hostname = server.hostname?.trim() ?? '';
    if (!hostname) {
      throw new BadRequestException('Najpierw ustaw hostname węzła (pole hostname), potem napraw daHost.');
    }
    const before = server.daHost;
    await this.prisma.server.update({ where: { id: server.id }, data: { daHost: hostname } });
    await this.audit.record({
      action: 'NODE_AUDIT_REPAIR',
      actorUserId,
      details: { serverId: server.id, actionId: 'repair-da-host', before, after: hostname },
    });
    const updated = await this.prisma.server.findUnique({ where: { id: server.id } });
    return {
      serverId: server.id,
      actionId: 'repair-da-host',
      ok: true,
      message: `daHost zaktualizowany na ${hostname}.`,
      check: updated ? await this.checkDaHost(updated) : null,
    };
  }

  private async repairCagefsEnable(
    server: Server,
    actorUserId: string,
  ): Promise<NodeRepairResultDto> {
    // CageFS install/init/enable runs on the node — queue the idempotent
    // hosting profile (skip the long CustomBuild rebuild). The profile's
    // configure_cloudlinux_cagefs step installs cagefs, runs --init and
    // --enable-all, and verifies cagefsctl --cagefs-status before exiting.
    const task = await this.nodeTasks.queueHostingProfile(server.id, actorUserId, {
      skipBuild: true,
    });
    await this.audit.record({
      action: 'NODE_AUDIT_REPAIR',
      actorUserId,
      details: { serverId: server.id, actionId: 'repair-cagefs-enable', taskId: task.id },
    });
    const updated = await this.prisma.server.findUnique({ where: { id: server.id } });
    return {
      serverId: server.id,
      actionId: 'repair-cagefs-enable',
      ok: true,
      message:
        'Zlecono profil hostingowy — CageFS zostanie zainstalowany i włączony na węźle. Śledź log w sekcji „Profil hostingowy”. Status CageFS zaktualizuje się po następnym raporcie agenta.',
      check: updated ? this.checkCagefs(updated) : null,
    };
  }

  private async repairDaPackage(
    server: Server,
    slug: string,
    actorUserId: string,
  ): Promise<NodeRepairResultDto> {
    const plan = await this.prisma.plan.findUnique({ where: { slug } });
    if (!plan) throw new BadRequestException(`Brak planu o slug=${slug}.`);

    let client: DirectAdminClient;
    try {
      client = await this.da.getClientForServer(server.id);
    } catch (err) {
      throw new BadRequestException(
        `DirectAdmin nie jest skonfigurowany dla tego węzła: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const spec = buildDaPackageSpecFromPlan(planResourceFields(plan));
    await client.upsertUserPackage(spec);
    await this.audit.record({
      action: 'NODE_AUDIT_REPAIR',
      actorUserId,
      details: { serverId: server.id, actionId: `repair-da-package-${slug}`, slug },
    });

    return {
      serverId: server.id,
      actionId: `repair-da-package-${slug}`,
      ok: true,
      message: `Pakiet ${slug} zapisany z realnymi limitami planu (bez flag u*, język ${DA_DEFAULT_LANGUAGE}).`,
      check: await this.checkDaPackage(client, plan),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private daPackageAttestation(): DocAttestation[] {
    return [
      {
        vendor: 'DirectAdmin',
        statement:
          'W CMD_API_MANAGE_USER_PACKAGES (zweryfikowane na DA 1.697) o "Bez ograniczeń" decyduje SAMA OBECNOŚĆ parametru u<pole> — wartość jest ignorowana (u<pole>=no też daje unlimited). Realny limit wymaga wysłania tylko <pole>=<n> BEZ u<pole>.',
        reference: 'https://docs.directadmin.com/developer/api/legacy-api.html',
        verifiedAt: '2026-05-31',
      },
      {
        vendor: 'CloudLinux',
        statement:
          'Limity LVE (cpu/mem/io/iops/ep/nproc) na poziomie pakietu utrwalane tylko przy integracji LVE w DA (CageFS). Egzekucja per-konto realizowana przez agenta verris-lve.sh (lvectl) i potwierdzona na żywo.',
        reference: 'https://docs.cloudlinux.com/lve_manager/',
      },
      {
        vendor: 'DirectAdmin',
        statement:
          'Limity systemd-cgroups pakietu (CPUQuota, MemoryHigh/Max, IO*BandwidthMax, IO*IOPSMax, TasksMax; cgroup=1, HAVE_CGROUPS=1) — puste pole = "Bez ograniczeń" (BRAK flagi u<pole>). Zweryfikowane na DA 1.697: zapis pakietu propaguje na istniejące konta i jest egzekwowany przez systemd (CPUQuotaPerSecUSec, MemoryMax, TasksMax na slice user-<uid>).',
        reference: 'https://www.directadmin.com/features.php?id=2934',
        verifiedAt: '2026-05-31',
      },
    ];
  }

  private daPackageRepair(slug: string, risk: 'safe' | 'caution' | 'danger') {
    return {
      actionId: `repair-da-package-${slug}`,
      risk,
      label: `Napraw pakiet ${slug}`,
      description: `Zapisze pakiet "${slug}" w DirectAdmin z realnymi limitami z planu: dysk, transfer (bez flag u*, które w DA oznaczają "Bez ograniczeń") oraz limity systemd-cgroups (CPUQuota, MemoryMax, IO, TasksMax — puste = bez ograniczeń) i język ${DA_DEFAULT_LANGUAGE}. Limity cgroups propagują również na ISTNIEJĄCE konta z tego pakietu (egzekwowane przez systemd).`,
      requiresConfirmation: true,
      confirmValue: null,
      warning:
        'Operacja nadpisuje definicję pakietu i zaostrza limity systemd istniejących kont z tego pakietu do wartości planu (CPU/RAM/IO/Tasks). Egzekucja jest natychmiastowa.',
    };
  }

  private async loadManagedPlans(): Promise<Plan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return plans;
  }

  private async tryDaClient(
    serverId: string,
  ): Promise<{ client: DirectAdminClient | null; error: string | null; scope: DaScopeProbe | null }> {
    let client: DirectAdminClient;
    try {
      client = await this.da.getClientForServer(serverId);
    } catch (err) {
      return { client: null, error: err instanceof Error ? err.message : String(err), scope: null };
    }
    const scope = await probeScope(client);
    return { client, error: null, scope };
  }
}

interface DaScopeProbe {
  packagesOk: boolean;
  packagesError: string | null;
  packageCount: number | null;
  accountsOk: boolean;
  accountsError: string | null;
}

async function probeScope(client: DirectAdminClient): Promise<DaScopeProbe> {
  const probe: DaScopeProbe = {
    packagesOk: false,
    packagesError: null,
    packageCount: null,
    accountsOk: false,
    accountsError: null,
  };
  try {
    const packages = await client.listUserPackages();
    probe.packagesOk = true;
    probe.packageCount = packages.length;
  } catch (err) {
    probe.packagesError = err instanceof Error ? err.message : String(err);
  }
  try {
    await client.listAccounts();
    probe.accountsOk = true;
  } catch (err) {
    probe.accountsError = err instanceof Error ? err.message : String(err);
  }
  return probe;
}

function readPeerCertificate(host: string, port: number): Promise<tls.PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error('Brak certyfikatu w odpowiedzi TLS'));
        } else {
          resolve(cert);
        }
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Przekroczono czas połączenia TLS'));
    });
    socket.on('error', (err) => reject(err));
  });
}

function isUnlimited(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === 'unlimited' || v === '' || v === 'on';
}

function numEq(actual: string | undefined, expected: number): boolean {
  if (actual === undefined) return false;
  const n = Number(actual);
  return Number.isFinite(n) && Math.floor(n) === Math.floor(expected);
}

/** Compare a DA cgroup value (e.g. "100%", "1024M", "10240K") by leading number. */
function cgroupNumEq(actual: string | undefined, expected: number): boolean {
  if (actual === undefined) return false;
  const m = actual.trim().match(/^(\d+)/);
  if (!m) return false;
  return Number(m[1]) === Math.floor(expected);
}

function isAllEmpty(info: Record<string, string>): boolean {
  return Object.values(info).every((v) => !v || v.trim() === '');
}

function worstStatus(statuses: AuditCheckStatus[]): AuditCheckStatus {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('WARN')) return 'WARN';
  if (statuses.length > 0 && statuses.every((s) => s === 'UNKNOWN')) return 'UNKNOWN';
  return 'OK';
}

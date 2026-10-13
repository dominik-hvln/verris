import { randomUUID } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StosWezlaService } from './stos-wezla.service.js';
import { DOZWOLONE, nastepnyKrokMariadb } from './stos-wezla.js';
import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ClientWebhooksService } from '../client-webhooks/client-webhooks.service.js';
import { AccountStatus, NodeTaskKind, NodeTaskStatus, Prisma, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlarmyService } from '../alarmy/alarmy.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { limitZLogu } from './poczta-wezla.js';
import { wynikUsuwania } from './kolejka-poczty.js';
import { DirectAdminService } from './directadmin.service.js';
import { PLANY_Z_PAKIETEM_DA } from './da-package-spec.js';
import { deltaKsiegi, KONTO_NIEISTNIEJACE, ksiegaUpdateData } from '../subscriptions/node-capacity.js';

/** Desired CloudLinux LVE state for a node (consumed by the on-node verris-lve agent). */
export interface NodeDesiredLve {
  packages: Array<{
    name: string;
    speedPct: number;
    pmemMb: number;
    vmemMb: number;
    ioKbps: number;
    iops: number;
    ep: number;
    nproc: number;
  }>;
  accounts: Array<{
    username: string;
    speedPct: number;
    pmemMb: number;
    ioKbps: number;
    iops: number;
    ep: number;
    nproc: number;
  }>;
}

const MAX_LOG_CHARS = 120_000;
/** RUNNING without complete/fail — reclaim so panel is not stuck (Governor can run up to ~60 min). */
const STALE_RUNNING_MS = 75 * 60 * 1000;
/** No progress heartbeat from agent — orphan detection (verris-task-run sends every 60 s). */
const HEARTBEAT_STALE_MS = 15 * 60 * 1000;

export type HostingProfileTaskPayload = {
  skipBuild?: boolean;
  dryRun?: boolean;
};

/**
 * VER-UPG / PB-30 — dozwolone docelowe wersje MariaDB = wersje manifestu (DOZWOLONE.mariadb): tylko te,
 * które obsługuje CloudLinux MySQL Governor (wymagany na każdym węźle). 11.8/12.3 odrzucał dopiero
 * skrypt węzła (governor_version_unsupported), po zleceniu zadania.
 */
export const ALLOWED_DB_VERSIONS: readonly string[] = DOZWOLONE.mariadb.map((m) => m.v);

/** PB-32 — wynik skryptu aktualizacji z logu zadania (ostatnia linia `VERRIS_UPDATE_RESULT=…`, node-update.script.ts). */
export function wynikAktualizacji(log: string | null | undefined): 'ok' | 'needs-reboot' | 'failed' | null {
  const m = [...(log ?? '').matchAll(/VERRIS_UPDATE_RESULT=(ok|needs-reboot|failed)\b/g)].pop();
  return (m?.[1] as 'ok' | 'needs-reboot' | 'failed' | undefined) ?? null;
}

/** PB-32 — stan ostatniej fali dla panelu (GET /admin/servers/fleet-update). */
export interface StanFali {
  id: string;
  wyrownaj: boolean;
  razem: number;
  /** trwa · zakonczona · zatrzymana (błąd węzła) · przerwana (węzeł OK, a następnego nie dało się zlecić). */
  stan: 'trwa' | 'zakonczona' | 'zatrzymana' | 'przerwana';
  /** Ile węzłów fali jeszcze nie zakończyło aktualizacji (bez zatrzymanego). */
  pozostale: number;
  wymagaRestartu: string[];
  rozpoczeta: string;
  wezly: Array<{
    nr: number;
    taskId: string;
    serverId: string;
    nazwa: string;
    status: NodeTaskStatus;
    wynik: 'ok' | 'needs-reboot' | 'failed' | null;
    blad: string | null;
    zlecono: string;
    start: string | null;
    koniec: string | null;
  }>;
}

/** PB-32 — stan fali aktualizacji niesiony w payloadzie zadania FLEET_UPDATE. */
export interface FalaAktualizacji {
  id: string;
  nr: number;
  razem: number;
  kolejka: string[];
  /** PB-33 — fala „Wyrównaj flotę”: węzeł przyjmuje wersje z manifestu (PHP/LiteSpeed, MariaDB krok po kroku). */
  wyrownaj?: boolean;
}

/**
 * Audyt Fali 3 — rodzaje zadań zlecane przebiegiem operatora (karta usługi / węzła), których „Ponów” z listy zadań
 * nie wykonuje (MALWARE_SCAN — tylko tryby zmieniające pliki: kwarantanna, przywrócenie, usunięcie).
 */
export const OPERACJE_BEZ_PONOWIENIA: Partial<Record<NodeTaskKind, string>> = {
  [NodeTaskKind.IP_BLOCKS]: 'Operacji na blokadach IP',
  [NodeTaskKind.MAIL_QUEUE]: 'Operacji na kolejce i limicie poczty',
  [NodeTaskKind.WAF_HITS]: 'Odczytu trafień WAF',
  [NodeTaskKind.MALWARE_SCAN]: 'Kwarantanny, przywrócenia ani usunięcia pliku',
};

/** Błąd zadania wskazujący na stan węzła (izolacja kont, PHP kont), a nie na dane klienta. */
export const BLAD_SYSTEMOWY_WEZLA = /CageFS|enter LVE|_lve_enter|init_lve|lsphp.*(fail|error)|cannot open session|brak PHP CLI/i;

@Injectable()
export class NodeTasksService {
  private readonly logger = new Logger(NodeTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
    @Optional() private readonly webhooks?: ClientWebhooksService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly stos?: StosWezlaService,
    @Optional() private readonly alarmy?: AlarmyService,
  ) {}

  /**
   * PB-29 — zielony raport gotowości (0 × FAIL) ustawia onboardVerifiedAt; czerwony go zdejmuje,
   * więc ponowny onboard z błędami od razu wyłącza węzeł z przydziału nowych kont.
   */
  async recordOnboardReport(
    serverId: string,
    r: { ok: boolean; fail: number; warn: number; podsumowanie?: string },
  ): Promise<void> {
    const zielony = r.ok && r.fail === 0;
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        onboardVerifiedAt: zielony ? new Date() : null,
        onboardReport: { ok: zielony, fail: r.fail, warn: r.warn, podsumowanie: (r.podsumowanie ?? '').slice(-20000), at: new Date().toISOString() },
      },
    });
    await this.audit.record({
      action: zielony ? 'NODE_ONBOARD_VERIFIED' : 'NODE_ONBOARD_FAILED',
      details: { serverId, fail: r.fail, warn: r.warn },
    });
    // Skrypt onboardu tworzy pakiety o nazwach z czasu jego napisania (starter/pro/business), a plany
    // w panelu się zmieniają — węzeł testowy 28.09 nie miał pakietów verris-hosting i poczta-standard.
    // Zielony onboard = pakiety wszystkich aktywnych planów z panelu (best-effort; provisioning i tak
    // robi ensureUserPackage, a audyt pokaże brak).
    if (zielony) {
      void this.directAdmin.syncPlanPackagesForServer(serverId).catch((err: unknown) => {
        this.logger.warn(`Sync pakietów DA po onboardzie server=${serverId}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  async queueHostingProfile(
    serverId: string,
    actorUserId: string,
    payload: HostingProfileTaskPayload = {},
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Nie znaleziono węzła.');
    if (server.status !== ServerStatus.ACTIVE) {
      throw new BadRequestException(
        `Profil hostingowy można uruchomić tylko na węźle ACTIVE (obecny: ${server.status}).`,
      );
    }
    if (!server.identityToken) {
      throw new BadRequestException(
        'Węzeł nie ma agenta (brak identity token). Uruchom bootstrap lub zainstaluj agenta zadań.',
      );
    }

    await this.reclaimStaleRunningTasks(serverId);

    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        serverId,
        kind: NodeTaskKind.HOSTING_PROFILE,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new BadRequestException(
        'Profil hostingowy jest już w kolejce lub w trakcie wykonywania na tym węźle.',
      );
    }

    const task = await this.prisma.nodeTask.create({
      data: {
        serverId,
        kind: NodeTaskKind.HOSTING_PROFILE,
        status: NodeTaskStatus.QUEUED,
        payload: {
          skipBuild: payload.skipBuild !== false,
          dryRun: payload.dryRun === true,
        },
        requestedById: actorUserId,
      },
    });

    await this.audit.record({
      action: 'NODE_TASK_QUEUED',
      actorUserId,
      details: { serverId, taskId: task.id, kind: task.kind, payload: task.payload },
    });

    return this.toPublicTask(task);
  }

  /**
   * VER-UPG — zleca upgrade silnika MariaDB węzła do wybranej wersji LTS.
   * Agent węzła (NodeTask DB_UPGRADE) robi pełny zrzut baz, a potem CustomBuild
   * `set mariadb X.Y && build mariadb`. Operacja długa i wrażliwa — wymaga węzła
   * ACTIVE z agentem, nie pozwala na równoległe zlecenia i jest audytowana.
   */
  async queueDbUpgrade(serverId: string, actorUserId: string | null, version: string, lancuch = false) {
    const target = (version ?? '').trim();
    if (!ALLOWED_DB_VERSIONS.includes(target)) {
      throw new BadRequestException(
        `Niedozwolona wersja docelowa „${target}". Dozwolone: ${ALLOWED_DB_VERSIONS.join(', ')}.`,
      );
    }

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Nie znaleziono węzła.');
    if (server.status !== ServerStatus.ACTIVE) {
      throw new BadRequestException(
        `Upgrade DB można uruchomić tylko na węźle ACTIVE (obecny: ${server.status}).`,
      );
    }
    if (!server.identityToken) {
      throw new BadRequestException(
        'Węzeł nie ma agenta (brak identity token). Zainstaluj agenta zadań i spróbuj ponownie.',
      );
    }

    // Ochrona przed downgrade po stronie control-plane (twardy guard jest też w skrypcie węzła).
    const verNum = (v: string) => {
      const [maj, min] = v.split('.').map((n) => Number.parseInt(n, 10) || 0);
      return maj * 1000 + min;
    };
    if (server.dbVersion) {
      const current = (server.dbVersion.match(/\d+\.\d+/) ?? [])[0];
      if (current && verNum(current) > verNum(target)) {
        throw new BadRequestException(
          `Downgrade ${current} → ${target} nie jest wspierany przez MariaDB (ryzyko utraty danych).`,
        );
      }
      if (current && verNum(current) === verNum(target)) {
        throw new BadRequestException(`Węzeł jest już na MariaDB ${target}.`);
      }
    }

    await this.reclaimStaleRunningTasks(serverId);

    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        serverId,
        kind: NodeTaskKind.DB_UPGRADE,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) {
      throw new BadRequestException('Upgrade DB jest już w kolejce lub w trakcie na tym węźle.');
    }

    const task = await this.prisma.nodeTask.create({
      data: {
        serverId,
        kind: NodeTaskKind.DB_UPGRADE,
        status: NodeTaskStatus.QUEUED,
        payload: { version: target, ...(lancuch ? { lancuch: '1' } : {}) },
        requestedById: actorUserId,
      },
    });

    await this.prisma.server.update({
      where: { id: serverId },
      data: { targetDbVersion: target, dbUpgradeRequestedAt: new Date() },
    });

    await this.audit.record({
      action: 'NODE_DB_UPGRADE_QUEUED',
      actorUserId: actorUserId ?? undefined,
      details: { serverId, taskId: task.id, from: server.dbVersion ?? null, to: target },
    });

    return this.toPublicTask(task);
  }

  /**
   * PB-31 — Onboard LIVE z panelu (hardening, egress, IP w DA, pakiety, profil, weryfikacja).
   * Idempotentne: nie duplikuje zadania, gdy jedno czeka albo trwa.
   */
  async queueOnboardLive(serverId: string, actorUserId: string | null) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Nie znaleziono węzła.');
    if (!server.identityToken) {
      throw new BadRequestException('Węzeł nie ma jeszcze agenta — najpierw bootstrap (krok 2).');
    }
    await this.reclaimStaleRunningTasks(serverId);
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        serverId,
        kind: 'ONBOARD_LIVE' as NodeTaskKind,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) return this.toPublicTask(inflight);
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId,
        kind: 'ONBOARD_LIVE' as NodeTaskKind,
        status: NodeTaskStatus.QUEUED,
        payload: {},
        requestedById: actorUserId,
      },
    });
    await this.audit.record({ action: 'NODE_ONBOARD_QUEUED', actorUserId: actorUserId ?? undefined, details: { serverId, taskId: task.id } });
    return this.toPublicTask(task);
  }

  /**
   * NODE-6 — zleca aktualizację stacku węzła do latest-stable (CustomBuild +
   * yum). Idempotentne: nie duplikuje zadania, gdy jedno już czeka/trwa.
   */
  async queueNodeUpdate(serverId: string, actorUserId: string | null, fala?: FalaAktualizacji) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Nie znaleziono węzła.');
    if (server.status !== ServerStatus.ACTIVE) {
      throw new BadRequestException(`Aktualizację można zlecić tylko na węźle ACTIVE (obecny: ${server.status}).`);
    }
    if (!server.identityToken) {
      throw new BadRequestException('Węzeł nie ma agenta (brak identity token).');
    }

    await this.reclaimStaleRunningTasks(serverId);
    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        serverId,
        kind: 'FLEET_UPDATE' as NodeTaskKind,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) return this.toPublicTask(inflight);

    const task = await this.prisma.nodeTask.create({
      data: {
        serverId,
        kind: 'FLEET_UPDATE' as NodeTaskKind,
        status: NodeTaskStatus.QUEUED,
        payload: (fala ? { fala, ...(fala.wyrownaj ? { wyrownaj: '1' } : {}) } : {}) as unknown as Prisma.InputJsonValue,
        requestedById: actorUserId,
      },
    });
    await this.audit.record({
      action: 'NODE_FLEET_UPDATE_QUEUED',
      actorUserId: actorUserId ?? undefined,
      details: { serverId, taskId: task.id, ...(fala ? { fala: fala.id, nr: fala.nr, razem: fala.razem } : {}) },
    });
    return this.toPublicTask(task);
  }

  /**
   * NODE-6 — aktualizacja CAŁEJ floty. Zleca zadanie na każdym węźle ACTIVE z
   * agentem. Rolling z natury: agent każdego węzła leasuje jedno zadanie naraz,
   * a admin może zawczasu zdrainować węzły. Zwraca liczbę zleconych.
   */
  async queueFleetUpdate(
    actorUserId: string | null,
    opts: { wyrownaj?: boolean } = {},
  ): Promise<{ queued: number; skipped: number; kanarek: string | null }> {
    // PB-32 — fala: najpierw węzeł kanarkowy (najmniej kont = najmniejsze ryzyko), potem reszta
    // po jednym; każdy następny rusza dopiero po udanej aktualizacji poprzedniego, błąd zatrzymuje falę.
    const trwa = await this.prisma.nodeTask.findFirst({
      where: { kind: 'FLEET_UPDATE' as NodeTaskKind, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
      select: { id: true },
    });
    if (trwa) throw new BadRequestException('Aktualizacja floty już trwa — poczekaj na jej koniec.');

    const servers = await this.prisma.server.findMany({
      where: { status: ServerStatus.ACTIVE },
      select: { id: true, identityToken: true, _count: { select: { accounts: { where: { status: { not: AccountStatus.DELETED } } } } } },
    });
    const zAgentem = servers.filter((s) => s.identityToken).sort((a, b) => a._count.accounts - b._count.accounts);
    const skipped = servers.length - zAgentem.length;
    if (zAgentem.length === 0) return { queued: 0, skipped, kanarek: null };

    const [kanarek, ...reszta] = zAgentem.map((s) => s.id);
    const fala: FalaAktualizacji = { id: randomUUID(), nr: 1, razem: zAgentem.length, kolejka: reszta, ...(opts.wyrownaj ? { wyrownaj: true } : {}) };
    await this.queueNodeUpdate(kanarek, actorUserId, fala);
    await this.audit.record({
      action: 'FLEET_UPDATE_QUEUED',
      actorUserId: actorUserId ?? undefined,
      details: { fala: fala.id, kanarek, kolejnosc: [kanarek, ...reszta], skipped, wyrownaj: !!opts.wyrownaj },
    });
    return { queued: 1, skipped, kanarek };
  }

  private async powiadomAdminow(title: string, body: string, link: string) {
    if (!this.notifications) return;
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    for (const a of admini) {
      await this.notifications.create({ userId: a.id, category: 'SYSTEM', severity: 'warning', title, body, link });
    }
  }

  /**
   * PB-33 — MariaDB do wersji z manifestu, po jednym kroku (wymóg CloudLinux Governor). Każdy krok to
   * zadanie DB_UPGRADE z kopią bazy przed zmianą; po udanym kroku zlecany jest następny (łańcuch).
   */
  private async krokMariadb(serverId: string) {
    if (!this.stos) return;
    const [m, srv] = await Promise.all([
      this.stos.pobierz(),
      this.prisma.server.findUnique({ where: { id: serverId }, select: { dbVersion: true } }),
    ]);
    const krok = nastepnyKrokMariadb(srv?.dbVersion, m.mariadb);
    if (!krok) return;
    await this.queueDbUpgrade(serverId, null, krok, true).catch(async (e: Error) => {
      await this.audit.record({ action: 'STACK_ALIGN_DB_SKIPPED', details: { serverId, krok, powod: e.message } });
    });
  }

  /**
   * PB-32 — „status w panelu zgodny z logiem”: ostatnia fala aktualizacji z przebiegiem po węzłach (kolejność,
   * stan zadania, wynik ze skryptu `VERRIS_UPDATE_RESULT=…`) i stanem całości. Źródłem są same zadania fali
   * (payload.fala.id) — ten sam zapis, który czyta agent i log zadania.
   */
  async stanFali(): Promise<StanFali | null> {
    const ostatnie = await this.prisma.nodeTask.findFirst({
      where: { kind: 'FLEET_UPDATE' as NodeTaskKind, payload: { path: ['fala', 'id'], not: Prisma.AnyNull } },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    const id = (ostatnie?.payload as { fala?: FalaAktualizacji } | null)?.fala?.id;
    if (!id) return null;
    const zadania = await this.prisma.nodeTask.findMany({
      where: { kind: 'FLEET_UPDATE' as NodeTaskKind, payload: { path: ['fala', 'id'], equals: id } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, serverId: true, status: true, payload: true, outputLog: true, errorMessage: true,
        createdAt: true, startedAt: true, completedAt: true, server: { select: { name: true } },
      },
    });
    const wezly = zadania.map((t) => {
      const f = (t.payload as unknown as { fala: FalaAktualizacji }).fala;
      return {
        nr: f.nr,
        taskId: t.id,
        serverId: t.serverId,
        nazwa: t.server?.name ?? t.serverId,
        status: t.status,
        wynik: wynikAktualizacji(t.outputLog),
        blad: t.status === NodeTaskStatus.FAILED ? (t.errorMessage ?? '').slice(0, 300) || null : null,
        zlecono: t.createdAt.toISOString(),
        start: t.startedAt?.toISOString() ?? null,
        koniec: t.completedAt?.toISOString() ?? null,
      };
    });
    const ostatni = zadania[zadania.length - 1];
    const fala = (ostatni.payload as unknown as { fala: FalaAktualizacji }).fala;
    const stan: StanFali['stan'] =
      ostatni.status === NodeTaskStatus.QUEUED || ostatni.status === NodeTaskStatus.RUNNING
        ? 'trwa'
        : ostatni.status === NodeTaskStatus.COMPLETED
          ? fala.kolejka.length === 0
            ? 'zakonczona'
            : 'przerwana'
          : 'zatrzymana';
    return {
      id,
      wyrownaj: !!fala.wyrownaj,
      razem: fala.razem,
      stan,
      pozostale: stan === 'zakonczona' ? 0 : fala.kolejka.length + (stan === 'trwa' ? 1 : 0),
      wymagaRestartu: wezly.filter((w) => w.wynik === 'needs-reboot').map((w) => w.nazwa),
      rozpoczeta: zadania[0].createdAt.toISOString(),
      wezly,
    };
  }

  /** PB-32 — po udanej aktualizacji węzła z fali zlecamy następny; po błędzie fala staje. */
  private async dalejFala(task: { serverId: string; payload: Prisma.JsonValue }, udane: boolean, log?: string | null) {
    const fala = (task.payload as { fala?: FalaAktualizacji } | null)?.fala;
    if (!fala) return;
    if (!udane) {
      await this.audit.record({
        action: 'FLEET_UPDATE_STOPPED',
        details: { fala: fala.id, serverId: task.serverId, nr: fala.nr, razem: fala.razem, pozostale: fala.kolejka },
      });
      await this.powiadomAdminow(
        'Fala aktualizacji zatrzymana',
        `Aktualizacja węzła ${fala.nr}/${fala.razem} nie powiodła się — pozostałe ${fala.kolejka.length} węzłów czeka. Sprawdź log zadania i uruchom falę ponownie po naprawie.`,
        `/nodes/${task.serverId}`,
      );
      return;
    }
    if (fala.wyrownaj) await this.krokMariadb(task.serverId);
    if (/VERRIS_UPDATE_RESULT=needs-reboot/.test(log ?? '')) {
      await this.audit.record({ action: 'FLEET_UPDATE_NEEDS_REBOOT', details: { fala: fala.id, serverId: task.serverId } });
    }
    const [nastepny, ...reszta] = fala.kolejka;
    if (!nastepny) {
      await this.audit.record({ action: 'FLEET_UPDATE_FINISHED', details: { fala: fala.id, razem: fala.razem } });
      return;
    }
    await this.queueNodeUpdate(nastepny, null, { ...fala, nr: fala.nr + 1, kolejka: reszta }).catch(async (e: Error) => {
      await this.audit.record({ action: 'FLEET_UPDATE_STOPPED', details: { fala: fala.id, serverId: nastepny, powod: e.message } });
    });
  }

  /** VER-UPG — historia zleceń upgrade DB dla węzła (panel admina). */
  async listDbUpgradeTasks(serverId: string, limit = 10) {
    await this.reclaimStaleRunningTasks(serverId);
    const tasks = await this.prisma.nodeTask.findMany({
      where: { serverId, kind: NodeTaskKind.DB_UPGRADE },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return tasks.map((t) => this.toPublicTask(t));
  }

  /**
   * Computes the desired CloudLinux LVE state the node should converge to:
   * one entry per active plan (package-level, so new accounts inherit limits)
   * and one per ACTIVE hosting account on this server (effective limits =
   * plan base + autoscaling delta, mirrored on `Account`). The on-node
   * `verris-lve` agent pulls this and applies it via `lvectl` — DA's API does
   * not actually enforce LVE (verified on DA 1.697).
   */
  async getDesiredLveForServer(serverId: string): Promise<NodeDesiredLve> {
    const [plans, accounts] = await Promise.all([
      this.prisma.plan.findMany({ where: PLANY_Z_PAKIETEM_DA, orderBy: { sortOrder: 'asc' } }),
      this.prisma.account.findMany({
        where: { serverId, status: AccountStatus.ACTIVE },
      }),
    ]);
    return {
      packages: plans.map((p) => ({
        name: p.slug,
        speedPct: p.cpuLimit,
        pmemMb: p.ramLimitMb,
        vmemMb: 0,
        ioKbps: p.ioLimitKbps,
        iops: p.iopsLimit,
        ep: p.entryProcesses,
        nproc: p.nprocLimit,
      })),
      accounts: accounts.map((a) => ({
        username: a.daUsername,
        speedPct: a.cpuLimit,
        pmemMb: a.ramLimitMb,
        ioKbps: a.ioLimitKbps,
        iops: a.iopsLimit,
        ep: a.entryProcesses,
        nproc: a.nprocLimit,
      })),
    };
  }

  async listHostingProfileTasks(serverId: string, limit = 10) {
    await this.reclaimStaleRunningTasks(serverId);

    const tasks = await this.prisma.nodeTask.findMany({
      where: { serverId, kind: NodeTaskKind.HOSTING_PROFILE },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return tasks.map((t) => this.toPublicTask(t));
  }

  /**
   * #13 — admin: ostatnie operacje węzłów (wszystkie rodzaje) z kontekstem
   * serwera/konta/zlecającego. Do widoku „Operacje" i ręcznego ponawiania.
   */
  async listRecentTasks(filter: { status?: NodeTaskStatus; serverId?: string; limit?: number }) {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 300);
    const rows = await this.prisma.nodeTask.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.serverId ? { serverId: filter.serverId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        server: { select: { name: true, hostname: true } },
        requestedBy: { select: { email: true } },
      },
    });

    // `account` nie jest relacją na NodeTask (tylko accountId) — dociągamy domeny
    // jednym zapytaniem i mapujemy.
    const accountIds = Array.from(
      new Set(rows.map((t) => t.accountId).filter((id): id is string => !!id)),
    );
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, domain: true },
        })
      : [];
    const domainById = new Map(accounts.map((a) => [a.id, a.domain]));

    return rows.map((t) => ({
      id: t.id,
      kind: t.kind,
      status: t.status,
      serverId: t.serverId,
      serverName: t.server?.name ?? t.server?.hostname ?? t.serverId,
      accountDomain: t.accountId ? (domainById.get(t.accountId) ?? null) : null,
      requestedByEmail: t.requestedBy?.email ?? null,
      errorMessage: t.errorMessage,
      startedAt: t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  /**
   * #13 — ręczne ponowienie nieudanej operacji (admin). Ustawia FAILED → QUEUED,
   * czyści ślady poprzedniego przebiegu; agent węzła ponownie ją podejmie.
   * Tylko dla FAILED (świadoma decyzja operatora, audytowana).
   */
  async retryFailedTask(taskId: string, actorUserId: string) {
    const task = await this.prisma.nodeTask.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Zadanie nie istnieje.');
    }
    if (task.status !== NodeTaskStatus.FAILED) {
      throw new BadRequestException('Ponowić można tylko zadanie ze statusem FAILED.');
    }
    // F3.4 — restart usługi węzła ma powód, potwierdzenie i (dla usług wspólnych) decyzję administratora albo wniosek;
    // ponowienie z listy zadań ominęłoby to wszystko. Odczyt logu z ponowienia nie miałby wpisu w dzienniku.
    if (task.kind === NodeTaskKind.NODE_SERVICES) {
      throw new BadRequestException('Usług i logów węzła nie ponawia się z listy zadań — zleć to jeszcze raz z zakładki „Usługi i logi” węzła.');
    }
    // Audyt Fali 3 — operacje operatora z Fali 3 mają własne uprawnienia (IP_BLOCKS_NODE, MAIL_SEND_BLOCK,
    // ACCOUNT_ACTIONS, ACCOUNT_DIAGNOSTICS_VIEW), powód, regułę „STAFF tylko na usługach klientów” i wpis klienta
    // „obsługa Verris”. „Ponów” (NODES_MANAGE) wykonałby je ponownie z pominięciem tego wszystkiego, a skutek przypisał
    // pierwotnemu zlecającemu — np. L4 bez IP_BLOCKS_NODE ponowiłby białą listę albo odblokowanie dowolnego adresu.
    // Takie zadania zleca się od nowa z karty usługi albo węzła; skan i lista skanera (bez zmian w plikach) — można.
    const operacjaOperatora = OPERACJE_BEZ_PONOWIENIA[task.kind as keyof typeof OPERACJE_BEZ_PONOWIENIA];
    if (operacjaOperatora && !(task.kind === NodeTaskKind.MALWARE_SCAN && ['scan', 'list'].includes(String((task.payload as { mode?: unknown } | null)?.mode)))) {
      throw new BadRequestException(`${operacjaOperatora} nie ponawia się z listy zadań — zleć ją jeszcze raz z karty usługi albo węzła (uprawnienia, powód i dziennik).`);
    }
    await this.prisma.nodeTask.update({
      where: { id: taskId },
      data: {
        status: NodeTaskStatus.QUEUED,
        errorMessage: null,
        outputLog: null,
        startedAt: null,
        completedAt: null,
      },
    });
    await this.audit.record({
      action: 'NODE_TASK_RETRIED',
      userId: actorUserId,
      actorUserId,
      details: { taskId, kind: task.kind, serverId: task.serverId },
    });
    return { ok: true as const };
  }

  /**
   * Audyt bezpieczeństwa 13.10: kolejka węzła była czystym FIFO — jedno konto, które zleciło dziesiątki zadań
   * (skan, statystyki, kopie), opóźniało o kilkadziesiąt minut zadania innych klientów i operatora (jeden lease
   * na minutę). Kolejność teraz:
   *  1. zadania operatora i całego węzła (bez konta albo zlecone przez ADMIN/STAFF) — najstarsze,
   *  2. wśród zadań klientów — najstarsze zadanie konta obsłużonego najdawniej (round-robin po koncie).
   */
  private async wybierzSprawiedliwie(serverId: string) {
    const kandydaci = await this.prisma.nodeTask.findMany({
      where: { serverId, status: NodeTaskStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { requestedBy: { select: { role: true } } },
    });
    if (!kandydaci.length) return null;
    const operatora = kandydaci.find((t) => !t.accountId || t.requestedBy?.role === 'ADMIN' || t.requestedBy?.role === 'STAFF');
    if (operatora) return operatora;

    const konta = [...new Set(kandydaci.map((t) => t.accountId as string))];
    if (konta.length === 1) return kandydaci[0];
    const obsluzone = await this.prisma.nodeTask.groupBy({
      by: ['accountId'],
      where: { serverId, accountId: { in: konta }, startedAt: { not: null } },
      _max: { startedAt: true },
    });
    const ostatnio = new Map(obsluzone.map((g) => [g.accountId, g._max.startedAt?.getTime() ?? 0]));
    let wybrane = kandydaci[0];
    for (const t of kandydaci) {
      const a = ostatnio.get(t.accountId) ?? 0;
      const b = ostatnio.get(wybrane.accountId) ?? 0;
      if (a < b) wybrane = t; // kandydaci są posortowani po createdAt, więc w ramach konta zostaje najstarsze
    }
    return wybrane;
  }

  async leaseTaskForNode(serverId: string) {
    await this.reclaimStaleRunningTasks(serverId);

    const task = await this.wybierzSprawiedliwie(serverId);
    if (!task) return null;

    const claimed = await this.prisma.nodeTask.updateMany({
      where: { id: task.id, status: NodeTaskStatus.QUEUED },
      data: {
        status: NodeTaskStatus.RUNNING,
        startedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return null;

    const updated = await this.prisma.nodeTask.findUnique({ where: { id: task.id } });
    if (!updated) return null;

    await this.audit.record({
      action: 'NODE_TASK_STARTED',
      details: { serverId, taskId: updated.id, kind: updated.kind },
    });

    return {
      id: updated.id,
      kind: updated.kind,
      payload: (updated.payload as HostingProfileTaskPayload | null) ?? {},
    };
  }

  async completeTaskFromNode(opts: {
    serverId: string;
    taskId: string;
    outputLog?: string;
  }) {
    const task = await this.assertRunningTask(opts.serverId, opts.taskId);
    const log = this.trimLog(opts.outputLog);

    // Przegląd F3.1 — zmiana limitu wysyłki: sukces tylko, gdy węzeł potwierdził DOKŁADNIE zleconą wartość dla tego
    // konta. Agent sprzed aktualizacji nie przekazuje MQ_LIMIT, a skrypt bez niego tylko czyta limit i kończy się zerem —
    // bez tej kontroli zmiana „udawała się”, a na serwerze nic się nie zmieniało.
    const zlecony = (task.payload ?? {}) as { mode?: string; limit?: string; daUser?: string };
    if (task.kind === NodeTaskKind.MAIL_QUEUE && zlecony.mode === 'limit' && typeof zlecony.limit === 'string') {
      const l = limitZLogu(log);
      const oczekiwany = zlecony.limit === 'domyslny' ? null : Number(zlecony.limit);
      if (!l || l.login !== zlecony.daUser || l.nieczytelny || l.limit !== oczekiwany) {
        return this.failTaskFromNode({
          serverId: opts.serverId,
          taskId: opts.taskId,
          outputLog: opts.outputLog,
          error: 'Serwer nie potwierdził nowego limitu — zaktualizuj węzeł („Aktualizuj węzeł”) i spróbuj ponownie',
        });
      }
    }

    const updated = await this.prisma.nodeTask.update({
      where: { id: task.id },
      data: {
        status: NodeTaskStatus.COMPLETED,
        // Hasła (baz, administratorów aplikacji) są potrzebne tylko węzłowi — po wykonaniu znikają z bazy.
        payload: bezSekretow(task.payload) as Prisma.InputJsonValue,
        outputLog: log,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'NODE_TASK_COMPLETED',
      details: { serverId: opts.serverId, taskId: task.id, kind: task.kind },
    });
    await this.webhooks?.poZadaniu(task, true);

    // H-16 — konto odtworzone z kopii off-site na tym węźle: przepinamy je tutaj dopiero, gdy węzeł
    // potwierdził, że DirectAdmin je założył (VERRIS-OFFSITE-RESTORED).
    const p = (task.payload ?? {}) as { mode?: string; przeniesienie?: string; daUser?: string };
    if (
      task.kind === NodeTaskKind.OFFSITE_RESTORE && p.mode === 'restore' && p.przeniesienie === '1' && task.accountId &&
      new RegExp(`^VERRIS-OFFSITE-RESTORED ${p.daUser}\\s*$`, 'm').test(log ?? '')
    ) {
      // 13.10 — przepięcie bez księgi pojemności (Z-16) zostawiało limity konta na starym węźle: asercja po migracji
      // zatrzymała wdrożenie („2 węzłów ma księgę niezgodną”). Limity przechodzą ze starego węzła na nowy w tej samej
      // transakcji co serverId; warunek na stary serverId chroni przed podwójnym przeniesieniem przy ponowionym raporcie.
      const accountId = task.accountId;
      const przed = await this.prisma.$transaction(async (tx) => {
        const k = await tx.account.findUnique({
          where: { id: accountId },
          select: { serverId: true, userId: true, status: true, cpuLimit: true, ramLimitMb: true, diskLimitMb: true },
        });
        if (!k || k.serverId === opts.serverId) return k;
        const o = await tx.account.updateMany({ where: { id: accountId, serverId: k.serverId }, data: { serverId: opts.serverId } });
        if (o.count > 0 && k.status !== AccountStatus.DELETED) {
          const limity = { cpu: k.cpuLimit, ramMb: k.ramLimitMb, diskMb: k.diskLimitMb };
          await tx.server.update({ where: { id: k.serverId }, data: ksiegaUpdateData(deltaKsiegi(limity, KONTO_NIEISTNIEJACE)) });
          await tx.server.update({ where: { id: opts.serverId }, data: ksiegaUpdateData(deltaKsiegi(KONTO_NIEISTNIEJACE, limity)) });
        }
        return k;
      });
      await this.audit.record({
        action: 'ACCOUNT_MOVED_TO_NODE',
        userId: przed?.userId ?? undefined,
        details: { accountId, fromServerId: przed?.serverId ?? null, toServerId: opts.serverId, taskId: task.id },
      });
    }

    if (task.kind === NodeTaskKind.FLEET_UPDATE) await this.dalejFala(task, true, log);

    if (task.kind === NodeTaskKind.MAIL_QUEUE && p.mode === 'remove') await this.dziennikUsunieciaZKolejki(task, opts.serverId, log);

    // F3.1 — limit wysyłki konta: w bazie (i w panelu klienta) dopiero wartość potwierdzona przez węzeł dla TEGO
    // konta — także po samym odczycie (ręczna zmiana na serwerze). Nieczytelny plik na węźle niczego nie nadpisuje.
    if (task.kind === NodeTaskKind.MAIL_QUEUE && p.mode === 'limit' && task.accountId) {
      const l = limitZLogu(log);
      const konto = await this.prisma.account.findUnique({ where: { id: task.accountId }, select: { daUsername: true, mailSendLimit: true, userId: true, subscriptionId: true } });
      if (l && konto && l.login === konto.daUsername && !l.nieczytelny && l.limit !== konto.mailSendLimit) {
        await this.prisma.account.update({ where: { id: task.accountId }, data: { mailSendLimit: l.limit } });
        // Weryfikacja 11.10 (D3) — zmiana zlecona przez obsługę (payload z `limit`; sam odczyt go nie ma) trafia na oś
        // „Co się działo” klienta dopiero z wartością potwierdzoną przez węzeł. Bez powodu i bez operatora.
        if ((task.payload as { limit?: unknown } | null)?.limit !== undefined) {
          await this.prisma.subscriptionEvent.create({
            data: { subscriptionId: konto.subscriptionId, type: 'MAIL_SEND_LIMIT_CHANGED', details: { source: 'OPERATOR', limit: l.limit, domyslny: l.domyslny } },
          });
        }
        await this.audit.record({
          action: SupportActions.MAIL_SEND_LIMIT_CONFIRMED,
          userId: konto.userId,
          actorUserId: task.requestedById ?? undefined,
          details: { taskId: task.id, serverId: opts.serverId, przed: konto.mailSendLimit, po: l.limit },
        });
      }
    }

    if (task.kind === NodeTaskKind.HOSTING_PROFILE) {
      await this.directAdmin.syncPlanPackagesForServer(opts.serverId).catch((err) => {
        this.logger.warn(
          `syncPlanPackagesForServer after profile failed server=${opts.serverId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    // VER-UPG — a completed DB_UPGRADE clears the pending marker; the actual
    // dbVersion is updated by the node telemetry (verris-lve) within ~1 min.
    if (task.kind === NodeTaskKind.DB_UPGRADE) {
      const target = (task.payload as { version?: string } | null)?.version ?? null;
      await this.prisma.server
        .update({
          where: { id: opts.serverId },
          data: {
            dbUpgradeRequestedAt: null,
            // optymistycznie pokazujemy wersję docelową od razu; telemetria potwierdzi/poprawi
            ...(target ? { dbVersion: target, dbCheckedAt: new Date() } : {}),
            targetDbVersion: null,
          },
        })
        .catch((err) => {
          this.logger.warn(
            `DB_UPGRADE post-complete update failed server=${opts.serverId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }
    // PB-33 — łańcuch „Wyrównaj flotę”: po udanym kroku MariaDB od razu następny (wersja już zapisana wyżej).
    if (task.kind === NodeTaskKind.DB_UPGRADE && (task.payload as { lancuch?: string } | null)?.lancuch === '1') {
      await this.krokMariadb(opts.serverId);
    }

    // B5 — a completed STAGING_SYNC(TO_STAGING) confirms the staging exists
    // and is freshly cloned; the timestamps drive the panel UI.
    if (task.kind === NodeTaskKind.STAGING_SYNC && task.accountId) {
      const direction = (task.payload as { direction?: string } | null)?.direction;
      if (direction === 'TO_STAGING') {
        const now = new Date();
        await this.prisma
          .$transaction([
            // createdAt only on the FIRST successful clone…
            this.prisma.account.updateMany({
              where: { id: task.accountId, stagingCreatedAt: null },
              data: { stagingCreatedAt: now },
            }),
            // …syncedAt on every successful clone/refresh.
            this.prisma.account.update({
              where: { id: task.accountId },
              data: { stagingSyncedAt: now },
            }),
          ])
          .catch((err) => {
            this.logger.warn(
              `staging timestamps update failed account=${task.accountId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
      }
    }

    // B2 — a completed WAF_APPLY confirms the mode is live on the node.
    if (task.kind === NodeTaskKind.WAF_APPLY && task.accountId) {
      await this.prisma.account
        .update({ where: { id: task.accountId }, data: { wafAppliedAt: new Date() } })
        .catch((err) => {
          this.logger.warn(
            `wafAppliedAt update failed account=${task.accountId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    // P-6 — a completed PHP_APPLY confirms the PHP version is live on the node.
    if (task.kind === NodeTaskKind.PHP_APPLY && task.accountId) {
      await this.prisma.account
        .update({ where: { id: task.accountId }, data: { phpAppliedAt: new Date() } })
        .catch((err) => {
          this.logger.warn(
            `phpAppliedAt update failed account=${task.accountId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    return this.toPublicTask(updated);
  }

  async progressTaskFromNode(opts: {
    serverId: string;
    taskId: string;
    outputLog?: string;
  }) {
    const task = await this.assertRunningTask(opts.serverId, opts.taskId);
    const log = this.trimLog(opts.outputLog);
    if (!log) {
      return this.toPublicTask(task);
    }

    const updated = await this.prisma.nodeTask.update({
      where: { id: task.id },
      data: { outputLog: log },
    });

    return this.toPublicTask(updated);
  }

  async failTaskFromNode(opts: {
    serverId: string;
    taskId: string;
    error: string;
    outputLog?: string;
  }) {
    const task = await this.assertRunningTask(opts.serverId, opts.taskId);

    const updated = await this.prisma.nodeTask.update({
      where: { id: task.id },
      data: {
        status: NodeTaskStatus.FAILED,
        errorMessage: opts.error.slice(0, 4000),
        outputLog: this.trimLog(opts.outputLog),
        completedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'NODE_TASK_FAILED',
      details: {
        serverId: opts.serverId,
        taskId: task.id,
        kind: task.kind,
        error: opts.error.slice(0, 500),
      },
    });
    await this.webhooks?.poZadaniu(task, false);
    if (task.kind === NodeTaskKind.FLEET_UPDATE) await this.dalejFala(task, false);
    await this.alarmBleduSystemowego(opts.serverId, task.kind, opts.error, opts.outputLog);
    // Audyt Fal 2 — błąd w trakcie usuwania (np. ostatnia paczka -Mrm): wcześniejsze usunięcia są nieodwracalne,
    // więc liczba z logu węzła trafia do dziennika także przy błędzie zadania. Surowy błąd węzła (exim…) zostaje
    // w zadaniu (panel operatora), nie we wpisie: wpis ma userId klienta, więc trafia do jego eksportu RODO (white label).
    if (task.kind === NodeTaskKind.MAIL_QUEUE && (task.payload as { mode?: string } | null)?.mode === 'remove' && wynikUsuwania(updated.outputLog).usunieto !== null) {
      await this.dziennikUsunieciaZKolejki(task, opts.serverId, updated.outputLog, true);
    }

    // P-6 — panel zapisuje wersję PHP przy zleceniu; odrzucona przez węzeł nie może zostać
    // pokazana klientowi jako „aktualna”. Wracamy do wersji sprzed zlecenia.
    const php = (task.payload ?? {}) as { poprzednia?: string | null };
    if (task.kind === NodeTaskKind.PHP_APPLY && task.accountId && 'poprzednia' in php) {
      await this.prisma.account
        .update({ where: { id: task.accountId }, data: { phpVersion: php.poprzednia ?? null } })
        .catch((err) => this.logger.warn(`phpVersion revert failed account=${task.accountId}: ${err instanceof Error ? err.message : String(err)}`));
    }

    return this.toPublicTask(updated);
  }

  /**
   * 13.10 (t1): WP_UPDATE o 03:20 padł na „brak PHP CLI dla konta (CageFS)” — objaw zepsutego LVE konta ponad godzinę
   * przed 503 strony, a widać go było tylko na liście zadań. Błąd zadania, który wskazuje na stan węzła (CageFS, LVE,
   * PHP kont, sesje PAM), to alarm dla adminów — raz na godzinę na węzeł.
   */
  private async alarmBleduSystemowego(serverId: string, kind: NodeTaskKind, error: string, outputLog?: string) {
    if (!this.alarmy) return;
    const tekst = `${error}\n${(outputLog ?? '').slice(-4000)}`;
    const m = BLAD_SYSTEMOWY_WEZLA.exec(tekst);
    if (!m) return;
    try {
      const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { name: true, hostname: true } });
      const wezel = s?.name ?? s?.hostname ?? serverId;
      await this.alarmy.wyslij({
        klucz: `zadanie-systemowe:${serverId}`,
        tytul: `Węzeł ${wezel}: zadanie ${kind} padło na błędzie systemowym`,
        tresc: `Zadanie ${kind} zakończyło się błędem, który wskazuje na stan węzła, nie na dane klienta:\n${error.slice(0, 600)}\n\nRozpoznane po: „${m[0]}”. Strażnik węzła sprawdza LVE i strony co minutę; sprawdź kartę węzła.`,
        link: `/nodes/${serverId}?sekcja=uslugi#straznik`,
        waga: 'ostrzezenie',
        cooldownMin: 60,
      });
    } catch (err) {
      this.logger.warn(`alarm błędu systemowego węzła ${serverId}: ${(err as Error).message}`);
    }
  }

  /** F3.1 — usunięcie wiadomości konta z kolejki: liczba usuniętych dopiero od węzła (dziennik zespołu, autor = zlecający). */
  private async dziennikUsunieciaZKolejki(task: { id: string; accountId: string | null; requestedById: string | null }, serverId: string, log: string | null, przerwane = false) {
    if (!task.accountId) return;
    const konto = await this.prisma.account.findUnique({ where: { id: task.accountId }, select: { userId: true, subscriptionId: true } });
    const { usunieto, pominieto } = wynikUsuwania(log);
    await this.audit.record({
      action: SupportActions.MAIL_QUEUE_MESSAGES_REMOVED,
      userId: konto?.userId,
      actorUserId: task.requestedById ?? undefined,
      details: { taskId: task.id, serverId, subscriptionId: konto?.subscriptionId ?? null, usunieto, pominieto, ...(przerwane ? { przerwane: true } : {}) },
    });
  }

  private async assertRunningTask(serverId: string, taskId: string) {
    const task = await this.prisma.nodeTask.findUnique({ where: { id: taskId } });
    if (!task || task.serverId !== serverId) {
      throw new NotFoundException('Task not found for this server');
    }
    if (task.status !== NodeTaskStatus.RUNNING) {
      throw new BadRequestException(`Task is not running (status: ${task.status})`);
    }
    return task;
  }

  private trimLog(log?: string | null) {
    if (!log) return null;
    const summary = this.extractVerrisProfileSummary(log);
    if (log.length <= MAX_LOG_CHARS) return log;
    const tail = log.slice(-MAX_LOG_CHARS);
    if (!summary) return tail;
    return `${summary}\n\n[… log obcięty — pełny na węźle: /var/log/verris-tasks/<task-id>.log …]\n\n${tail}`;
  }

  /** Lines emitted at end of profile + default page — survive tail truncation in DB. */
  private extractVerrisProfileSummary(log: string): string | null {
    const lines = log.split('\n').filter(
      (l) =>
        l.includes('[VERRIS_PROFILE]') ||
        l.includes('[VERRIS_DEFAULT_PAGE]') ||
        l.includes('[verris-default-page]'),
    );
    if (lines.length === 0) return null;
    return lines.slice(-6).join('\n');
  }

  /** Fail RUNNING tasks with no agent callback — unblocks admin panel re-run. */
  private async reclaimStaleRunningTasks(serverId: string) {
    const absoluteCutoff = new Date(Date.now() - STALE_RUNNING_MS);
    const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
    const stale = await this.prisma.nodeTask.findMany({
      where: {
        serverId,
        status: NodeTaskStatus.RUNNING,
        OR: [{ startedAt: { lt: absoluteCutoff } }, { updatedAt: { lt: heartbeatCutoff } }],
      },
    });
    for (const task of stale) {
      const noHeartbeat =
        task.updatedAt < heartbeatCutoff && task.startedAt && task.startedAt >= absoluteCutoff;
      await this.prisma.nodeTask.update({
        where: { id: task.id },
        data: {
          status: NodeTaskStatus.FAILED,
          errorMessage: noHeartbeat
            ? 'Brak heartbeat z węzła przez 15 min (agent mógł paść po starcie). Na węźle: journalctl -u verris-task@<instance>, tail /var/log/verris-tasks/<task-id>.log, potem uruchom install agenta (agent-3) i profil ponownie.'
            : 'Zadanie przekroczyło 75 min bez potwierdzenia z węzła (np. restart agenta podczas Governor/CustomBuild). Sprawdź /var/log/verris-tasks/<task-id>.log na węźle i uruchom profil ponownie.',
          completedAt: new Date(),
        },
      });
      await this.audit.record({
        action: 'NODE_TASK_STALE_FAILED',
        details: { serverId, taskId: task.id, kind: task.kind },
      });
    }
  }

  private toPublicTask(task: {
    id: string;
    serverId: string;
    kind: NodeTaskKind;
    status: NodeTaskStatus;
    payload: unknown;
    outputLog: string | null;
    errorMessage: string | null;
    requestedById: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: task.id,
      serverId: task.serverId,
      kind: task.kind,
      status: task.status,
      payload: bezSekretow(task.payload),
      outputLog: task.outputLog,
      errorMessage: task.errorMessage,
      requestedById: task.requestedById,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}

const KLUCZ_SEKRETU = /pass|secret|token/i;

/** Payload bez haseł/tokenów — do zapisu po wykonaniu zadania i do pokazania w panelu administratora. */
export function bezSekretow(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([k, v]) => [k, KLUCZ_SEKRETU.test(k) && v ? '••••••' : v]),
  );
}

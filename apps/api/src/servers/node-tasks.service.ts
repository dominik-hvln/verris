import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountStatus, NodeTaskKind, NodeTaskStatus, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from './directadmin.service';

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

/** VER-UPG — dozwolone docelowe wersje MariaDB (aktualne LTS, czerwiec 2026). */
export const ALLOWED_DB_VERSIONS = ['11.4', '11.8', '12.3'] as const;
export type AllowedDbVersion = (typeof ALLOWED_DB_VERSIONS)[number];

@Injectable()
export class NodeTasksService {
  private readonly logger = new Logger(NodeTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async queueHostingProfile(
    serverId: string,
    actorUserId: string,
    payload: HostingProfileTaskPayload = {},
  ) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
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
  async queueDbUpgrade(serverId: string, actorUserId: string, version: string) {
    const target = (version ?? '').trim();
    if (!(ALLOWED_DB_VERSIONS as readonly string[]).includes(target)) {
      throw new BadRequestException(
        `Niedozwolona wersja docelowa „${target}". Dozwolone: ${ALLOWED_DB_VERSIONS.join(', ')}.`,
      );
    }

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
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
        payload: { version: target },
        requestedById: actorUserId,
      },
    });

    await this.prisma.server.update({
      where: { id: serverId },
      data: { targetDbVersion: target, dbUpgradeRequestedAt: new Date() },
    });

    await this.audit.record({
      action: 'NODE_DB_UPGRADE_QUEUED',
      actorUserId,
      details: { serverId, taskId: task.id, from: server.dbVersion ?? null, to: target },
    });

    return this.toPublicTask(task);
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
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
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

  async leaseTaskForNode(serverId: string) {
    await this.reclaimStaleRunningTasks(serverId);

    const task = await this.prisma.nodeTask.findFirst({
      where: {
        serverId,
        status: NodeTaskStatus.QUEUED,
      },
      orderBy: { createdAt: 'asc' },
    });
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

    const updated = await this.prisma.nodeTask.update({
      where: { id: task.id },
      data: {
        status: NodeTaskStatus.COMPLETED,
        outputLog: log,
        errorMessage: null,
        completedAt: new Date(),
      },
    });

    await this.audit.record({
      action: 'NODE_TASK_COMPLETED',
      details: { serverId: opts.serverId, taskId: task.id, kind: task.kind },
    });

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

    return this.toPublicTask(updated);
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
      payload: task.payload,
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus, ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

const MAX_LOG_CHARS = 120_000;
/** RUNNING without complete/fail — reclaim so panel is not stuck (Governor can run up to ~60 min). */
const STALE_RUNNING_MS = 75 * 60 * 1000;
/** No progress heartbeat from agent — orphan detection (verris-task-run sends every 60 s). */
const HEARTBEAT_STALE_MS = 15 * 60 * 1000;

export type HostingProfileTaskPayload = {
  skipBuild?: boolean;
  dryRun?: boolean;
};

@Injectable()
export class NodeTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  async listHostingProfileTasks(serverId: string, limit = 10) {
    await this.reclaimStaleRunningTasks(serverId);

    const tasks = await this.prisma.nodeTask.findMany({
      where: { serverId, kind: NodeTaskKind.HOSTING_PROFILE },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return tasks.map((t) => this.toPublicTask(t));
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
    if (log.length <= MAX_LOG_CHARS) return log;
    return log.slice(-MAX_LOG_CHARS);
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

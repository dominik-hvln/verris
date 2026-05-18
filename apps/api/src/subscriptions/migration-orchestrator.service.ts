import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MigrationStatus,
  MigrationWorkerJobKind,
  MigrationWorkerJobStatus,
  Prisma,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CreateMigrationBundleDto,
  RequestExternalMigrationDto,
  RequestInternalMigrationDto,
} from './dto/migration.dto';
import { MigrationActions } from '../common/audit/audit.actions';

type MigrationViewRow = {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown> | null;
};

export interface MigrationRequestSummary {
  id: string;
  status: MigrationStatus;
  currentStep: string | null;
  targetDomain: string | null;
  bytesTransferred: string;
  filesTransferred: number;
  databasesMigrated: number;
  mailboxesMigrated: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  ticketId: string | null;
}

@Injectable()
export class MigrationOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private async assertSubscriptionForUser(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    return sub;
  }

  async requestExternalMigration(subscriptionId: string, userId: string, dto: RequestExternalMigrationDto) {
    const sub = await this.assertSubscriptionForUser(subscriptionId, userId);
    const sourceSecretEnc = this.crypto.encrypt(
      JSON.stringify({
        host: dto.sourceHost,
        port: dto.sourcePort,
        username: dto.sourceUsername,
        password: dto.sourcePassword,
        path: dto.sourcePath ?? null,
      }),
    );

    const event = await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'MIGRATION_EXTERNAL_REQUESTED',
        details: {
          sourceType: dto.sourceType,
          sourceHost: dto.sourceHost,
          sourcePort: dto.sourcePort,
          sourceUsername: dto.sourceUsername,
          sourcePath: dto.sourcePath ?? null,
          notes: dto.notes ?? null,
          sourceSecretEnc,
          requestedAt: new Date().toISOString(),
          accountDomain: sub.account?.domain ?? null,
          accountUsername: sub.account?.daUsername ?? null,
        },
      },
    });

    await this.audit.record({
      action: 'MIGRATION_EXTERNAL_REQUESTED',
      userId,
      actorUserId: userId,
      details: {
        subscriptionId,
        migrationEventId: event.id,
        sourceType: dto.sourceType,
        sourceHost: dto.sourceHost,
      },
    });

    return { ok: true as const, migrationId: event.id };
  }

  async requestInternalMigrationByAdmin(
    subscriptionId: string,
    actorUserId: string,
    dto: RequestInternalMigrationDto,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const event = await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'MIGRATION_INTERNAL_REQUESTED',
        details: {
          targetServerId: dto.targetServerId,
          notes: dto.notes ?? null,
          requestedAt: new Date().toISOString(),
          requestedBy: actorUserId,
          accountDomain: sub.account?.domain ?? null,
          accountUsername: sub.account?.daUsername ?? null,
        },
      },
    });

    await this.audit.record({
      action: 'MIGRATION_INTERNAL_REQUESTED',
      userId: sub.userId,
      actorUserId,
      details: {
        subscriptionId,
        migrationEventId: event.id,
        targetServerId: dto.targetServerId,
      },
    });

    return { ok: true as const, migrationId: event.id };
  }

  /**
   * Sprint 7 / R-MIG-1 — pakietowe zlecenie migracji (FTP+MySQL+IMAP+target).
   * Zwraca summary zlecenia (bez sekretów). Sekrety wracają **tylko** gdy
   * staff wywoła `getMigrationSecretsForOperator`.
   */
  async createBundle(
    subscriptionId: string,
    userId: string,
    dto: CreateMigrationBundleDto,
  ): Promise<MigrationRequestSummary> {
    const sub = await this.assertSubscriptionForUser(subscriptionId, userId);
    if (!dto.ftp && (!dto.mysql || dto.mysql.length === 0) && (!dto.imap || dto.imap.length === 0)) {
      throw new BadRequestException(
        'Wskaż co najmniej jedno źródło (FTP/SFTP, MySQL lub IMAP) do migracji.',
      );
    }
    const bundle = JSON.stringify({
      targetDomain: dto.targetDomain ?? null,
      ftp: dto.ftp ?? null,
      mysql: dto.mysql ?? null,
      imap: dto.imap ?? null,
      notes: dto.notes ?? null,
      submittedAt: new Date().toISOString(),
    });

    const request = await this.prisma.migrationRequest.create({
      data: {
        subscriptionId,
        userId,
        sourceBundleEnc: this.crypto.encrypt(bundle),
        targetDomain: dto.targetDomain ?? null,
        status: MigrationStatus.QUEUED,
        currentStep: 'queued',
        workerJobs: dto.ftp
          ? {
              create: {
                kind: MigrationWorkerJobKind.FILES_SFTP_RSYNC,
                status: MigrationWorkerJobStatus.QUEUED,
                idempotencyKey: `migration:${subscriptionId}:${Date.now()}:files`,
                payload: {
                  targetPath: 'public_html',
                  targetDomain: dto.targetDomain ?? sub.account?.domain ?? null,
                  sourceProtocol: dto.ftp.protocol ?? 'sftp',
                  sourceHost: dto.ftp.host,
                  sourcePort: dto.ftp.port,
                  sourceUsername: dto.ftp.username,
                  sourceRemotePath: dto.ftp.remotePath ?? '/',
                },
              },
            }
          : undefined,
      },
      include: { workerJobs: true },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'MIGRATION_BUNDLE_QUEUED',
        details: {
          migrationRequestId: request.id,
          targetDomain: request.targetDomain,
          accountDomain: sub.account?.domain ?? null,
          sources: {
            ftp: !!dto.ftp,
            mysql: dto.mysql?.length ?? 0,
            imap: dto.imap?.length ?? 0,
          },
        },
      },
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_BUNDLE_QUEUED,
      userId,
      actorUserId: userId,
      details: {
        subscriptionId,
        migrationRequestId: request.id,
        targetDomain: request.targetDomain,
        firstWorkerJobId: request.workerJobs[0]?.id ?? null,
      },
    });

    if (request.workerJobs[0]) {
      await this.audit.record({
        action: MigrationActions.MIGRATION_WORKER_JOB_QUEUED,
        userId,
        actorUserId: userId,
        details: {
          subscriptionId,
          migrationRequestId: request.id,
          jobId: request.workerJobs[0].id,
          kind: request.workerJobs[0].kind,
        },
      });
    }

    return this.toSummary(request);
  }

  async listBundlesForUser(
    subscriptionId: string,
    userId: string,
  ): Promise<MigrationRequestSummary[]> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    const rows = await this.prisma.migrationRequest.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async listAllBundlesForStaff(opts: {
    status?: MigrationStatus;
    limit?: number;
  } = {}): Promise<MigrationRequestSummary[]> {
    const where: Prisma.MigrationRequestWhereInput = {};
    if (opts.status) where.status = opts.status;
    const rows = await this.prisma.migrationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 100, 200),
    });
    return rows.map((r) => this.toSummary(r));
  }

  /**
   * Wywoływane wyłącznie przez staffowy panel migracji. Każde wywołanie
   * jest audytowane (kto, kiedy, dla jakiego ticketu). Nie wracamy nigdy
   * całego bundle bez zapisu w audicie — to jedyna ścieżka do sekretów.
   */
  async revealSecretsForStaff(opts: {
    migrationRequestId: string;
    actorUserId: string;
    actorRole: string;
    reason: string | null;
  }) {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: opts.migrationRequestId },
    });
    if (!request) throw new NotFoundException('Migration request not found');

    let bundle: unknown;
    try {
      bundle = JSON.parse(this.crypto.decrypt(request.sourceBundleEnc));
    } catch {
      throw new BadRequestException('Migration bundle could not be decrypted');
    }

    await this.audit.record({
      action: 'MIGRATION_SECRETS_REVEALED',
      userId: request.userId,
      actorUserId: opts.actorUserId,
      details: {
        migrationRequestId: request.id,
        subscriptionId: request.subscriptionId,
        actorRole: opts.actorRole,
        reason: opts.reason ?? null,
      },
    });

    return {
      id: request.id,
      status: request.status,
      targetDomain: request.targetDomain,
      bundle,
    };
  }

  async setStatusForStaff(opts: {
    migrationRequestId: string;
    actorUserId: string;
    status: MigrationStatus;
    note?: string | null;
  }): Promise<MigrationRequestSummary> {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: opts.migrationRequestId },
    });
    if (!request) throw new NotFoundException('Migration request not found');

    const updated = await this.prisma.migrationRequest.update({
      where: { id: request.id },
      data: {
        status: opts.status,
        startedAt:
          opts.status === MigrationStatus.RUNNING && !request.startedAt
            ? new Date()
            : request.startedAt,
        completedAt:
          opts.status === MigrationStatus.COMPLETED ||
          opts.status === MigrationStatus.FAILED ||
          opts.status === MigrationStatus.CANCELED
            ? new Date()
            : null,
        currentStep:
          opts.status === MigrationStatus.COMPLETED
            ? 'done'
            : opts.status === MigrationStatus.RUNNING
              ? (request.currentStep ?? 'running')
              : opts.status.toLowerCase(),
      },
    });

    await this.audit.record({
      action: `MIGRATION_STATUS_${opts.status}`,
      userId: request.userId,
      actorUserId: opts.actorUserId,
      details: {
        migrationRequestId: request.id,
        subscriptionId: request.subscriptionId,
        previousStatus: request.status,
        note: opts.note ?? null,
      },
    });

    return this.toSummary(updated);
  }

  async leaseFileWorkerJobForNode(serverId: string) {
    const job = await this.prisma.migrationWorkerJob.findFirst({
      where: {
        kind: MigrationWorkerJobKind.FILES_SFTP_RSYNC,
        status: { in: [MigrationWorkerJobStatus.QUEUED, MigrationWorkerJobStatus.RETRYING] },
        migrationRequest: {
          subscription: {
            account: { serverId },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        migrationRequest: {
          include: {
            subscription: { include: { account: true } },
          },
        },
      },
    });
    if (!job) return null;

    const updated = await this.prisma.migrationWorkerJob.update({
      where: { id: job.id },
      data: {
        status: MigrationWorkerJobStatus.RUNNING,
        workerId: serverId,
        attempts: { increment: 1 },
        startedAt: job.startedAt ?? new Date(),
      },
    });
    await this.prisma.migrationRequest.update({
      where: { id: job.migrationRequestId },
      data: {
        status: MigrationStatus.RUNNING,
        currentStep: 'files',
        startedAt: job.migrationRequest.startedAt ?? new Date(),
      },
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_WORKER_JOB_STARTED,
      userId: job.migrationRequest.userId,
      details: {
        migrationRequestId: job.migrationRequestId,
        jobId: job.id,
        serverId,
        kind: job.kind,
      },
    });

    const bundle = JSON.parse(this.crypto.decrypt(job.migrationRequest.sourceBundleEnc)) as {
      ftp?: {
        host: string;
        port: number;
        username: string;
        password: string;
        remotePath?: string;
        protocol?: string;
      } | null;
    };
    if (!bundle.ftp) {
      throw new BadRequestException('Migration bundle does not contain FTP/SFTP source.');
    }

    return {
      id: updated.id,
      migrationRequestId: job.migrationRequestId,
      kind: updated.kind,
      attempts: updated.attempts,
      source: {
        protocol: bundle.ftp.protocol ?? 'sftp',
        host: bundle.ftp.host,
        port: bundle.ftp.port,
        username: bundle.ftp.username,
        password: bundle.ftp.password,
        remotePath: bundle.ftp.remotePath ?? '/',
      },
      target: {
        accountUsername: job.migrationRequest.subscription.account?.daUsername ?? null,
        domain:
          job.migrationRequest.targetDomain ??
          job.migrationRequest.subscription.account?.domain ??
          null,
        path: 'public_html',
      },
    };
  }

  async completeWorkerJobFromNode(opts: {
    serverId: string;
    jobId: string;
    bytesTransferred: bigint;
    filesTransferred: number;
    log?: string | null;
  }) {
    const job = await this.assertWorkerJobForServer(opts.serverId, opts.jobId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const workerJob = await tx.migrationWorkerJob.update({
        where: { id: job.id },
        data: {
          status: MigrationWorkerJobStatus.COMPLETED,
          completedAt: new Date(),
          log: trimWorkerLog(opts.log),
          lastError: null,
        },
      });
      await tx.migrationRequest.update({
        where: { id: job.migrationRequestId },
        data: {
          status: MigrationStatus.COMPLETED,
          currentStep: 'done',
          bytesTransferred: opts.bytesTransferred,
          filesTransferred: opts.filesTransferred,
          completedAt: new Date(),
          lastError: null,
        },
      });
      return workerJob;
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_WORKER_JOB_COMPLETED,
      userId: job.migrationRequest.userId,
      details: {
        migrationRequestId: job.migrationRequestId,
        jobId: job.id,
        serverId: opts.serverId,
        bytesTransferred: opts.bytesTransferred.toString(),
        filesTransferred: opts.filesTransferred,
      },
    });
    return { ok: true as const, jobId: updated.id };
  }

  async failWorkerJobFromNode(opts: {
    serverId: string;
    jobId: string;
    error: string;
    log?: string | null;
    retryable?: boolean;
  }) {
    const job = await this.assertWorkerJobForServer(opts.serverId, opts.jobId);
    const nextStatus =
      opts.retryable === true && job.attempts < job.maxAttempts
        ? MigrationWorkerJobStatus.RETRYING
        : MigrationWorkerJobStatus.FAILED;
    await this.prisma.$transaction(async (tx) => {
      await tx.migrationWorkerJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          lastError: opts.error,
          log: trimWorkerLog(opts.log),
          completedAt: nextStatus === MigrationWorkerJobStatus.FAILED ? new Date() : null,
        },
      });
      await tx.migrationRequest.update({
        where: { id: job.migrationRequestId },
        data: {
          status:
            nextStatus === MigrationWorkerJobStatus.FAILED
              ? MigrationStatus.FAILED
              : MigrationStatus.RUNNING,
          currentStep: 'files',
          lastError: opts.error,
          completedAt: nextStatus === MigrationWorkerJobStatus.FAILED ? new Date() : null,
        },
      });
    });
    await this.audit.record({
      action: MigrationActions.MIGRATION_WORKER_JOB_FAILED,
      userId: job.migrationRequest.userId,
      details: {
        migrationRequestId: job.migrationRequestId,
        jobId: job.id,
        serverId: opts.serverId,
        retryable: opts.retryable === true,
        status: nextStatus,
      },
    });
    return { ok: true as const, status: nextStatus };
  }

  private async assertWorkerJobForServer(serverId: string, jobId: string) {
    const job = await this.prisma.migrationWorkerJob.findUnique({
      where: { id: jobId },
      include: {
        migrationRequest: {
          include: {
            subscription: { include: { account: true } },
          },
        },
      },
    });
    if (!job || job.migrationRequest.subscription.account?.serverId !== serverId) {
      throw new NotFoundException('Migration worker job not found for this node.');
    }
    return job;
  }

  private toSummary(row: {
    id: string;
    status: MigrationStatus;
    currentStep: string | null;
    targetDomain: string | null;
    bytesTransferred: bigint;
    filesTransferred: number;
    databasesMigrated: number;
    mailboxesMigrated: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lastError: string | null;
    ticketId: string | null;
  }): MigrationRequestSummary {
    return {
      id: row.id,
      status: row.status,
      currentStep: row.currentStep,
      targetDomain: row.targetDomain,
      bytesTransferred: row.bytesTransferred.toString(),
      filesTransferred: row.filesTransferred,
      databasesMigrated: row.databasesMigrated,
      mailboxesMigrated: row.mailboxesMigrated,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastError: row.lastError,
      ticketId: row.ticketId,
    };
  }

  async listMigrationTimelineForUser(subscriptionId: string, userId: string): Promise<MigrationViewRow[]> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    return this.listMigrationTimelineRaw(subscriptionId);
  }

  async listMigrationTimelineForAdmin(subscriptionId: string): Promise<MigrationViewRow[]> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.listMigrationTimelineRaw(subscriptionId);
  }

  private async listMigrationTimelineRaw(subscriptionId: string): Promise<MigrationViewRow[]> {
    const rows = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId, type: { startsWith: 'MIGRATION_' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, createdAt: true, details: true },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      details: this.sanitizeDetails(row.details),
    }));
  }

  private sanitizeDetails(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const d = { ...(raw as Record<string, unknown>) };
    if ('sourceSecretEnc' in d) {
      d.sourceSecretEnc = '[encrypted]';
    }
    return d;
  }
}

function trimWorkerLog(log: string | null | undefined): string | null {
  if (!log) return null;
  return log.length > 262_144 ? log.slice(-262_144) : log;
}


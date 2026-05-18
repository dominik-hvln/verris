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
        workerJobs: {
          create: buildWorkerJobs(subscriptionId, dto, sub.account?.domain ?? null),
        },
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

    for (const job of request.workerJobs) {
      await this.audit.record({
        action: MigrationActions.MIGRATION_WORKER_JOB_QUEUED,
        userId,
        actorUserId: userId,
        details: {
          subscriptionId,
          migrationRequestId: request.id,
          jobId: job.id,
          kind: job.kind,
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

    const claimed = await this.prisma.migrationWorkerJob.updateMany({
      where: {
        id: job.id,
        status: { in: [MigrationWorkerJobStatus.QUEUED, MigrationWorkerJobStatus.RETRYING] },
        attempts: { lt: job.maxAttempts },
      },
      data: {
        status: MigrationWorkerJobStatus.RUNNING,
        workerId: serverId,
        attempts: { increment: 1 },
        startedAt: job.startedAt ?? new Date(),
      },
    });
    if (claimed.count !== 1) return null;

    const updated = await this.prisma.migrationWorkerJob.findUnique({
      where: { id: job.id },
      include: {
        migrationRequest: {
          include: {
            subscription: { include: { account: true } },
          },
        },
      },
    });
    if (!updated) return null;

    await this.prisma.migrationRequest.update({
      where: { id: updated.migrationRequestId },
      data: {
        status: MigrationStatus.RUNNING,
        currentStep: workerStep(updated.kind),
        startedAt: updated.migrationRequest.startedAt ?? new Date(),
      },
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_WORKER_JOB_STARTED,
      userId: updated.migrationRequest.userId,
      details: {
        migrationRequestId: updated.migrationRequestId,
        jobId: updated.id,
        serverId,
        kind: updated.kind,
      },
    });

    const bundle = JSON.parse(this.crypto.decrypt(updated.migrationRequest.sourceBundleEnc)) as {
      ftp?: {
        host: string;
        port: number;
        username: string;
        password: string;
        remotePath?: string;
        protocol?: string;
      } | null;
      mysql?: Array<{
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
      }>;
      imap?: Array<{
        host: string;
        port: number;
        email: string;
        username: string;
        password: string;
      }>;
    };
    const payload = updated.payload && typeof updated.payload === 'object' && !Array.isArray(updated.payload)
      ? (updated.payload as Record<string, unknown>)
      : {};

    const response: Record<string, unknown> = {
      id: updated.id,
      migrationRequestId: updated.migrationRequestId,
      kind: updated.kind,
      attempts: updated.attempts,
      target: {
        accountUsername: updated.migrationRequest.subscription.account?.daUsername ?? null,
        domain:
          updated.migrationRequest.targetDomain ??
          updated.migrationRequest.subscription.account?.domain ??
          null,
        path: 'public_html',
      },
    };
    if (updated.kind === MigrationWorkerJobKind.FILES_SFTP_RSYNC) {
      if (!bundle.ftp) throw new BadRequestException('Migration bundle does not contain FTP/SFTP source.');
      response.source = {
        protocol: bundle.ftp.protocol ?? 'sftp',
        host: bundle.ftp.host,
        port: bundle.ftp.port,
        username: bundle.ftp.username,
        password: bundle.ftp.password,
        remotePath: bundle.ftp.remotePath ?? '/',
      };
    } else if (updated.kind === MigrationWorkerJobKind.MYSQL_IMPORT) {
      const source = bundle.mysql?.[Number(payload.index ?? 0)];
      if (!source) throw new BadRequestException('Migration bundle does not contain MySQL source.');
      response.source = source;
    } else if (updated.kind === MigrationWorkerJobKind.IMAP_SYNC) {
      const source = bundle.imap?.[Number(payload.index ?? 0)];
      if (!source) throw new BadRequestException('Migration bundle does not contain IMAP source.');
      response.source = source;
    } else if (updated.kind === MigrationWorkerJobKind.HTTP_POST_CHECK) {
      response.check = {
        url: `https://${updated.migrationRequest.targetDomain ?? updated.migrationRequest.subscription.account?.domain}`,
      };
    }
    return response;
  }

  async completeWorkerJobFromNode(opts: {
    serverId: string;
    jobId: string;
    bytesTransferred: bigint;
    filesTransferred: number;
    databasesMigrated?: number;
    mailboxesMigrated?: number;
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
      const remaining = await tx.migrationWorkerJob.count({
        where: {
          migrationRequestId: job.migrationRequestId,
          id: { not: job.id },
          status: { in: [MigrationWorkerJobStatus.QUEUED, MigrationWorkerJobStatus.RUNNING, MigrationWorkerJobStatus.RETRYING] },
        },
      });
      await tx.migrationRequest.update({
        where: { id: job.migrationRequestId },
        data: {
          status: remaining === 0 ? MigrationStatus.COMPLETED : MigrationStatus.RUNNING,
          currentStep: remaining === 0 ? 'done' : 'worker-queue',
          bytesTransferred: { increment: opts.bytesTransferred },
          filesTransferred: { increment: opts.filesTransferred },
          databasesMigrated: { increment: opts.databasesMigrated ?? 0 },
          mailboxesMigrated: { increment: opts.mailboxesMigrated ?? 0 },
          completedAt: remaining === 0 ? new Date() : null,
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
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: job.migrationRequestId },
      select: { status: true, subscriptionId: true },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: job.migrationRequest.subscriptionId,
        type:
          request?.status === MigrationStatus.COMPLETED
            ? 'MIGRATION_BUNDLE_COMPLETED'
            : 'MIGRATION_WORKER_JOB_COMPLETED',
        details: {
          migrationRequestId: job.migrationRequestId,
          jobId: job.id,
          kind: job.kind,
          nextStatus: request?.status ?? null,
        },
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
          currentStep: workerStep(job.kind),
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
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: job.migrationRequest.subscriptionId,
        type:
          nextStatus === MigrationWorkerJobStatus.FAILED
            ? 'MIGRATION_BUNDLE_FAILED'
            : 'MIGRATION_WORKER_JOB_RETRYING',
        details: {
          migrationRequestId: job.migrationRequestId,
          jobId: job.id,
          kind: job.kind,
          retryable: opts.retryable === true,
          error: opts.error,
        },
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

function buildWorkerJobs(
  subscriptionId: string,
  dto: CreateMigrationBundleDto,
  accountDomain: string | null,
): Prisma.MigrationWorkerJobCreateWithoutMigrationRequestInput[] {
  const stamp = Date.now();
  const targetDomain = dto.targetDomain ?? accountDomain ?? null;
  const jobs: Prisma.MigrationWorkerJobCreateWithoutMigrationRequestInput[] = [];
  if (dto.ftp) {
    jobs.push({
      kind: MigrationWorkerJobKind.FILES_SFTP_RSYNC,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:files`,
      payload: {
        targetPath: 'public_html',
        targetDomain,
        sourceProtocol: dto.ftp.protocol ?? 'sftp',
        sourceHost: dto.ftp.host,
        sourcePort: dto.ftp.port,
        sourceUsername: dto.ftp.username,
        sourceRemotePath: dto.ftp.remotePath ?? '/',
      },
    });
  }
  dto.mysql?.forEach((source, index) => {
    jobs.push({
      kind: MigrationWorkerJobKind.MYSQL_IMPORT,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:mysql:${index}`,
      payload: { index, database: source.database, targetDomain },
    });
  });
  dto.imap?.forEach((source, index) => {
    jobs.push({
      kind: MigrationWorkerJobKind.IMAP_SYNC,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:imap:${index}`,
      payload: { index, username: source.username, targetDomain },
    });
  });
  if (targetDomain) {
    jobs.push({
      kind: MigrationWorkerJobKind.HTTP_POST_CHECK,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:http-post-check`,
      payload: { targetDomain, url: `https://${targetDomain}` },
    });
  }
  return jobs;
}

function workerStep(kind: MigrationWorkerJobKind): string {
  switch (kind) {
    case MigrationWorkerJobKind.FILES_SFTP_RSYNC:
      return 'files';
    case MigrationWorkerJobKind.MYSQL_IMPORT:
      return 'mysql';
    case MigrationWorkerJobKind.IMAP_SYNC:
      return 'imap';
    case MigrationWorkerJobKind.HTTP_POST_CHECK:
      return 'http-post-check';
  }
}


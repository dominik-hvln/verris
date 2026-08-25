import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MigrationStatus,
  MigrationWorkerJobKind,
  MigrationWorkerJobStatus,
  Prisma,
  Role,
} from '@verris/database';
import * as nodeCrypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DirectAdminService } from '../servers/directadmin.service';
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
  sourcePanelType: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  cutoverMode: string | null;
  cutoverAt: string | null;
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

/** Widok pojedynczego kroku dla klienta/staffa (bez sekretów). */
export interface MigrationJobView {
  id: string;
  kind: MigrationWorkerJobKind;
  status: MigrationWorkerJobStatus;
  sequence: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  progress: { bytes: string; files: number; note: string | null; at: string } | null;
  integrity: Record<string, unknown> | null;
  lastHeartbeatAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MigrationBundleDetail extends MigrationRequestSummary {
  jobs: MigrationJobView[];
}

/** Ile minut ciszy od workera uznajemy za zawieszenie joba (watchdog). */
export const MIGRATION_STALL_MINUTES = 20;

/**
 * Retencja sekretów migracji (hasła klienta do starego hostingu).
 * Po zakończeniu trzymamy je jeszcze przez okno na delta-sync/cutover, potem
 * kasujemy zaszyfrowany bundle. Awarie kasujemy szybciej (staff ma czas na
 * inspekcję/retry przez reveal-secrets).
 */
export const MIGRATION_SECRET_TTL_COMPLETED_DAYS = 7;
export const MIGRATION_SECRET_TTL_FAILED_DAYS = 3;

/** Ile zleceń migracji „w toku" dopuszczamy jednocześnie na jedną subskrypcję. */
export const MIGRATION_MAX_ACTIVE_PER_SUBSCRIPTION = 1;

@Injectable()
export class MigrationOrchestratorService {
  private readonly logger = new Logger(MigrationOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  /**
   * Pre-provisioning baz docelowych w DirectAdmin — wywoływane przez scheduler
   * zaraz po pre-backupie. Dla każdego źródła MySQL tworzymy przez DA API
   * bazę + użytkownika z losowym hasłem (baza jest widoczna w panelu klienta,
   * a creds trafiają zaszyfrowane do bundla: import na nodzie i WP_FIXUP
   * używają ich zamiast root-socketa). Idempotentne: pomija już utworzone.
   */
  async prepareMysqlTargets(migrationRequestId: string): Promise<void> {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: migrationRequestId },
    });
    if (!request) throw new NotFoundException('Migration request not found');

    const bundle = JSON.parse(this.crypto.decrypt(request.sourceBundleEnc)) as {
      mysql?: Array<{ database: string }> | null;
      targets?: { mysql?: Array<{ database: string; username: string; password: string }> };
      [key: string]: unknown;
    };
    const sources = bundle.mysql ?? [];
    if (sources.length === 0) return;
    if (bundle.targets?.mysql && bundle.targets.mysql.length === sources.length) return; // już zrobione

    const targets: Array<{ database: string; username: string; password: string }> = [];
    const usedNames = new Set<string>();
    for (const source of sources) {
      const base = source.database.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16) || 'db';
      // DA i tak prefiksuje nazwą konta — tu pilnujemy tylko unikalności części po prefiksie.
      let name = base;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `${base.slice(0, 14)}${suffix}`;
        suffix += 1;
      }
      usedNames.add(name);
      const password = nodeCrypto.randomBytes(18).toString('base64url');
      const created = await this.directAdmin.createHostingMysqlDatabase(
        request.subscriptionId,
        request.userId,
        { name, user: name, password },
      );
      targets.push({ database: created.database, username: created.username, password });
    }

    bundle.targets = { ...(bundle.targets ?? {}), mysql: targets };
    await this.prisma.migrationRequest.update({
      where: { id: request.id },
      data: { sourceBundleEnc: this.crypto.encrypt(JSON.stringify(bundle)) },
    });
  }

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

    // RODO / powierzenie przetwarzania — bez wyraźnego upoważnienia nie ruszamy
    // cudzych systemów ani nie kopiujemy danych. Wymóg egzekwowany serwerowo.
    if (dto.consentAccepted !== true) {
      throw new BadRequestException(
        'Aby uruchomić migrację, potwierdź upoważnienie do przeniesienia danych (zgoda RODO).',
      );
    }

    // Limit współbieżnych migracji na usługę — nie pozwalamy zakolejkować
    // kolejnej, dopóki poprzednia jest w toku/oczekuje (ochrona przed
    // zalaniem węzła backupami DA i transferami z jednego konta).
    const active = await this.prisma.migrationRequest.count({
      where: {
        subscriptionId,
        status: {
          in: [MigrationStatus.QUEUED, MigrationStatus.RUNNING, MigrationStatus.ATTENTION],
        },
      },
    });
    if (active >= MIGRATION_MAX_ACTIVE_PER_SUBSCRIPTION) {
      throw new BadRequestException(
        'Dla tej usługi trwa już migracja. Poczekaj na jej zakończenie (podgląd postępu poniżej) ' +
          'albo dograj różnice funkcją delta-sync, zamiast uruchamiać nową.',
      );
    }

    const bundle = JSON.stringify({
      targetDomain: dto.targetDomain ?? null,
      sourceDomain: dto.sourceDomain ?? null,
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
        sourcePanelType: dto.sourcePanelType ?? 'manual',
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
        // Ślad zgody/upoważnienia (RODO) — kto, kiedy, na jakiej podstawie.
        consent: {
          accepted: true,
          at: new Date().toISOString(),
          basis: 'client_authorization_dpa',
        },
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
  } = {}): Promise<Array<MigrationRequestSummary & { clientEmail: string; accountDomain: string | null }>> {
    const where: Prisma.MigrationRequestWhereInput = {};
    if (opts.status) where.status = opts.status;
    const rows = await this.prisma.migrationRequest.findMany({
      where,
      // Eskalacje („Pilne”) zawsze na górze kolejki staffa.
      orderBy: [{ needsAttention: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(opts.limit ?? 100, 200),
      include: {
        subscription: { include: { account: true, user: { select: { email: true } } } },
      },
    });
    return rows.map((r) => ({
      ...this.toSummary(r),
      clientEmail: r.subscription.user.email,
      accountDomain: r.subscription.account?.domain ?? null,
    }));
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
    if (request.secretsPurgedAt) {
      throw new BadRequestException(
        'Dane dostępowe tej migracji zostały już usunięte zgodnie z retencją (po zakończeniu). Nie ma ich w systemie.',
      );
    }

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
    // Kandydaci: joby QUEUED/RETRYING na tym nodzie, zlecenia bez eskalacji.
    // Kolejność wykonania w ramach zlecenia wymusza `sequence` (pliki → bazy →
    // WP fixup → poczta → post-check) — lease nie wyda joba, dopóki wszystkie
    // wcześniejsze kroki tego zlecenia nie są zakończone.
    const candidates = await this.prisma.migrationWorkerJob.findMany({
      where: {
        status: { in: [MigrationWorkerJobStatus.QUEUED, MigrationWorkerJobStatus.RETRYING] },
        migrationRequest: {
          status: { in: [MigrationStatus.QUEUED, MigrationStatus.RUNNING] },
          needsAttention: false,
          subscription: {
            account: { serverId },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
      take: 25,
      select: { id: true, migrationRequestId: true, sequence: true, maxAttempts: true, startedAt: true },
    });
    if (candidates.length === 0) return null;

    const requestIds = [...new Set(candidates.map((c) => c.migrationRequestId))];
    const siblings = await this.prisma.migrationWorkerJob.findMany({
      where: { migrationRequestId: { in: requestIds } },
      select: { migrationRequestId: true, sequence: true, status: true },
    });

    const job = candidates.find((candidate) => {
      const mine = siblings.filter((s) => s.migrationRequestId === candidate.migrationRequestId);
      const anyRunning = mine.some((s) => s.status === MigrationWorkerJobStatus.RUNNING);
      const earlierUnfinished = mine.some(
        (s) =>
          s.sequence < candidate.sequence &&
          s.status !== MigrationWorkerJobStatus.COMPLETED &&
          s.status !== MigrationWorkerJobStatus.CANCELED,
      );
      return !anyRunning && !earlierUnfinished;
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
        lastHeartbeatAt: new Date(),
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
      sourceDomain?: string | null;
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
        email?: string;
        username: string;
        password: string;
      }>;
      targets?: {
        mysql?: Array<{ database: string; username: string; password: string }>;
      };
    };
    const payload = updated.payload && typeof updated.payload === 'object' && !Array.isArray(updated.payload)
      ? (updated.payload as Record<string, unknown>)
      : {};

    const targetDomain =
      updated.migrationRequest.targetDomain ??
      updated.migrationRequest.subscription.account?.domain ??
      null;
    const response: Record<string, unknown> = {
      id: updated.id,
      migrationRequestId: updated.migrationRequestId,
      kind: updated.kind,
      attempts: updated.attempts,
      target: {
        accountUsername: updated.migrationRequest.subscription.account?.daUsername ?? null,
        domain: targetDomain,
        path: 'public_html',
      },
    };
    if (
      updated.kind === MigrationWorkerJobKind.FILES_SFTP_RSYNC ||
      updated.kind === MigrationWorkerJobKind.FILES_DELTA
    ) {
      if (!bundle.ftp) throw new BadRequestException('Migration bundle does not contain FTP/SFTP source.');
      response.source = {
        protocol: bundle.ftp.protocol ?? 'sftp',
        host: bundle.ftp.host,
        port: bundle.ftp.port,
        username: bundle.ftp.username,
        password: bundle.ftp.password,
        remotePath: bundle.ftp.remotePath ?? '/',
      };
      response.delta = updated.kind === MigrationWorkerJobKind.FILES_DELTA;
    } else if (updated.kind === MigrationWorkerJobKind.MYSQL_IMPORT) {
      const index = Number(payload.index ?? 0);
      const source = bundle.mysql?.[index];
      if (!source) throw new BadRequestException('Migration bundle does not contain MySQL source.');
      response.source = source;
      // Baza docelowa utworzona przez DA API (prepareMysqlTargets) — import
      // idzie na jej creds; brak = worker używa root-socketa (fallback).
      response.targetDb = bundle.targets?.mysql?.[index] ?? null;
      // Fallback SSH: gdy zdalny MySQL jest zablokowany, worker może zrobić
      // mysqldump przez SSH na koncie plikowym (o ile źródło plików to sftp).
      if (bundle.ftp && (bundle.ftp.protocol ?? 'sftp') === 'sftp') {
        response.sshFallback = {
          host: bundle.ftp.host,
          port: bundle.ftp.port,
          username: bundle.ftp.username,
          password: bundle.ftp.password,
        };
      }
    } else if (
      updated.kind === MigrationWorkerJobKind.IMAP_SYNC ||
      updated.kind === MigrationWorkerJobKind.IMAP_DELTA
    ) {
      const source = bundle.imap?.[Number(payload.index ?? 0)];
      if (!source) throw new BadRequestException('Migration bundle does not contain IMAP source.');
      response.source = { ...source, email: source.email ?? source.username };
      response.delta = updated.kind === MigrationWorkerJobKind.IMAP_DELTA;
    } else if (updated.kind === MigrationWorkerJobKind.WP_FIXUP) {
      response.wp = {
        targetDomain,
        sourceDomain: bundle.sourceDomain ?? null,
        databases: (bundle.mysql ?? []).map((m, i) => ({
          source: m.database,
          target: bundle.targets?.mysql?.[i] ?? null,
        })),
      };
    } else if (updated.kind === MigrationWorkerJobKind.HTTP_POST_CHECK) {
      response.check = {
        url: `https://${targetDomain}`,
      };
    }
    return response;
  }

  /**
   * Heartbeat/progress z node — worker melduje postęp długich transferów.
   * Watchdog traktuje brak heartbeatu > MIGRATION_STALL_MINUTES jako stall.
   */
  async progressWorkerJobFromNode(opts: {
    serverId: string;
    jobId: string;
    bytesTransferred?: bigint;
    filesTransferred?: number;
    note?: string | null;
  }) {
    const job = await this.assertWorkerJobForServer(opts.serverId, opts.jobId);
    if (job.status !== MigrationWorkerJobStatus.RUNNING) {
      return { ok: false as const, reason: 'job is not running' };
    }
    const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
      ? (job.payload as Record<string, unknown>)
      : {};
    payload.progress = {
      bytes: (opts.bytesTransferred ?? 0n).toString(),
      files: opts.filesTransferred ?? 0,
      note: opts.note ?? null,
      at: new Date().toISOString(),
    };
    await this.prisma.migrationWorkerJob.update({
      where: { id: job.id },
      data: {
        lastHeartbeatAt: new Date(),
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return { ok: true as const };
  }

  /**
   * Watchdog — wywoływany z cron-a: joby RUNNING bez heartbeatu przez
   * MIGRATION_STALL_MINUTES wracają do RETRYING (kolejny lease ponowi),
   * a po wyczerpaniu prób zlecenie jest eskalowane do staffa.
   */
  async requeueOrEscalateStalledJobs(): Promise<{ requeued: number; escalated: number }> {
    const cutoff = new Date(Date.now() - MIGRATION_STALL_MINUTES * 60 * 1000);
    const stalled = await this.prisma.migrationWorkerJob.findMany({
      where: {
        status: MigrationWorkerJobStatus.RUNNING,
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          { lastHeartbeatAt: null, startedAt: { lt: cutoff } },
        ],
      },
      include: { migrationRequest: true },
      take: 20,
    });

    let requeued = 0;
    let escalated = 0;
    for (const job of stalled) {
      if (job.attempts < job.maxAttempts) {
        await this.prisma.migrationWorkerJob.update({
          where: { id: job.id },
          data: {
            status: MigrationWorkerJobStatus.RETRYING,
            lastError: `Watchdog: brak sygnału od workera przez ${MIGRATION_STALL_MINUTES} min — ponawiam.`,
          },
        });
        requeued += 1;
        this.logger.warn(`migration watchdog requeued job=${job.id} request=${job.migrationRequestId}`);
      } else {
        await this.prisma.migrationWorkerJob.update({
          where: { id: job.id },
          data: {
            status: MigrationWorkerJobStatus.FAILED,
            completedAt: new Date(),
            lastError: `Watchdog: worker przestał odpowiadać (${job.attempts}/${job.maxAttempts} prób).`,
          },
        });
        await this.escalateToStaff(
          job.migrationRequestId,
          `Krok ${job.kind} zawiesił się po ${job.attempts} próbach (brak heartbeatu > ${MIGRATION_STALL_MINUTES} min).`,
        );
        escalated += 1;
      }
    }
    return { requeued, escalated };
  }

  /**
   * Retencja sekretów — kasuje zaszyfrowany bundle (hasła źródła) po upływie
   * okna od zakończenia migracji. Ustawia `secretsPurgedAt` i zeruje
   * `sourceBundleEnc`. Idempotentne (pomija już wyczyszczone). Wywoływane z cron.
   */
  async purgeExpiredSecrets(): Promise<{ purged: number }> {
    const now = Date.now();
    const completedCutoff = new Date(now - MIGRATION_SECRET_TTL_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(now - MIGRATION_SECRET_TTL_FAILED_DAYS * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.migrationRequest.findMany({
      where: {
        secretsPurgedAt: null,
        OR: [
          { status: MigrationStatus.COMPLETED, completedAt: { lt: completedCutoff } },
          {
            status: { in: [MigrationStatus.FAILED, MigrationStatus.CANCELED] },
            completedAt: { lt: failedCutoff },
          },
        ],
      },
      select: { id: true, userId: true, subscriptionId: true, status: true },
      take: 100,
    });

    let purged = 0;
    for (const req of expired) {
      await this.prisma.migrationRequest.update({
        where: { id: req.id },
        data: {
          // Pusty ciąg = brak sekretów; wszystkie ścieżki dekryptujące najpierw
          // sprawdzają `secretsPurgedAt`, więc nie próbują deszyfrować pustego.
          sourceBundleEnc: '',
          secretsPurgedAt: new Date(),
        },
      });
      await this.audit.record({
        action: MigrationActions.MIGRATION_SECRETS_PURGED,
        userId: req.userId,
        details: { migrationRequestId: req.id, subscriptionId: req.subscriptionId, status: req.status },
      });
      purged += 1;
    }
    if (purged > 0) this.logger.log(`migration secret retention: purged ${purged} bundle(s)`);
    return { purged };
  }

  /**
   * Eskalacja do staffa: automat staje, zlecenie ląduje jako „Pilne” na górze
   * kolejki staff + ticket URGENT + powiadomienie in-app dla staff/adminów.
   */
  async escalateToStaff(migrationRequestId: string, reason: string): Promise<void> {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: migrationRequestId },
      include: {
        subscription: { include: { account: true, user: { select: { id: true, email: true } } } },
      },
    });
    if (!request || request.needsAttention) return;

    const domain = request.targetDomain ?? request.subscription.account?.domain ?? '—';
    let ticketId = request.ticketId;
    if (!ticketId) {
      const ticket = await this.prisma.ticket.create({
        data: {
          userId: request.userId,
          subject: `[PILNE] Migracja ${domain} wymaga dokończenia przez zespół`,
          message: [
            `Automatyczna migracja #${request.id.slice(0, 8)} została zatrzymana.`,
            `Powód: ${reason}`,
            '',
            'Zlecenie czeka w kolejce migracji staff (sekcja „Pilne”). Sekrety źródła',
            'dostępne wyłącznie przez panel staff (odsłonięcie audytowane).',
          ].join('\n'),
          department: 'TECHNICAL',
          priority: 'URGENT',
        },
      });
      ticketId = ticket.id;
    }

    await this.prisma.migrationRequest.update({
      where: { id: request.id },
      data: {
        status: MigrationStatus.ATTENTION,
        needsAttention: true,
        attentionReason: reason,
        attentionAt: new Date(),
        currentStep: 'attention',
        lastError: reason,
        ticketId,
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: request.subscriptionId,
        type: 'MIGRATION_ESCALATED',
        details: { migrationRequestId: request.id, reason, ticketId },
      },
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_ESCALATED,
      userId: request.userId,
      details: { migrationRequestId: request.id, subscriptionId: request.subscriptionId, reason, ticketId },
    });

    // Powiadomienie in-app dla całego zespołu (best-effort, z deduplikacją).
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.STAFF, Role.ADMIN] } },
      select: { id: true },
      take: 50,
    });
    for (const member of staff) {
      await this.notifications.create({
        userId: member.id,
        category: 'SYSTEM',
        severity: 'critical',
        title: `Migracja ${domain} wymaga uwagi`,
        body: reason,
        link: '/migrations',
        dedupeKey: `migration-attention:${request.id}`,
      });
    }
  }

  /** Staff: rozwiązanie eskalacji — wznowienie automatu albo zamknięcie zlecenia. */
  async resolveAttentionForStaff(opts: {
    migrationRequestId: string;
    actorUserId: string;
    outcome: 'requeue' | 'completed' | 'failed';
    note?: string | null;
  }): Promise<MigrationRequestSummary> {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: opts.migrationRequestId },
      include: { workerJobs: true },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    if (!request.needsAttention && request.status !== MigrationStatus.ATTENTION) {
      throw new BadRequestException('Zlecenie nie jest w stanie eskalacji.');
    }

    let status: MigrationStatus;
    if (opts.outcome === 'requeue') {
      // Nieudane joby wracają do kolejki ze świeżym licznikiem prób.
      await this.prisma.migrationWorkerJob.updateMany({
        where: {
          migrationRequestId: request.id,
          status: { in: [MigrationWorkerJobStatus.FAILED, MigrationWorkerJobStatus.RETRYING] },
        },
        data: {
          status: MigrationWorkerJobStatus.QUEUED,
          attempts: 0,
          lastError: null,
          completedAt: null,
        },
      });
      status = MigrationStatus.RUNNING;
    } else if (opts.outcome === 'completed') {
      status = MigrationStatus.COMPLETED;
    } else {
      status = MigrationStatus.FAILED;
    }

    const updated = await this.prisma.migrationRequest.update({
      where: { id: request.id },
      data: {
        status,
        needsAttention: false,
        attentionReason: null,
        currentStep:
          status === MigrationStatus.RUNNING ? 'worker-queue' : status === MigrationStatus.COMPLETED ? 'done' : 'failed',
        completedAt: status === MigrationStatus.RUNNING ? null : new Date(),
        lastError: status === MigrationStatus.RUNNING ? null : request.lastError,
      },
    });

    await this.audit.record({
      action: MigrationActions.MIGRATION_ATTENTION_RESOLVED,
      userId: request.userId,
      actorUserId: opts.actorUserId,
      details: {
        migrationRequestId: request.id,
        outcome: opts.outcome,
        note: opts.note ?? null,
      },
    });
    return this.toSummary(updated);
  }

  /** Staff: ponowienie pojedynczego joba (np. po poprawieniu danych po stronie źródła). */
  async retryWorkerJobForStaff(opts: {
    migrationRequestId: string;
    jobId: string;
    actorUserId: string;
  }): Promise<MigrationJobView> {
    const job = await this.prisma.migrationWorkerJob.findFirst({
      where: { id: opts.jobId, migrationRequestId: opts.migrationRequestId },
    });
    if (!job) throw new NotFoundException('Worker job not found');
    if (job.status === MigrationWorkerJobStatus.RUNNING) {
      throw new BadRequestException('Job jest w trakcie wykonywania.');
    }
    const updated = await this.prisma.migrationWorkerJob.update({
      where: { id: job.id },
      data: {
        status: MigrationWorkerJobStatus.QUEUED,
        attempts: 0,
        lastError: null,
        completedAt: null,
      },
    });
    await this.prisma.migrationRequest.update({
      where: { id: opts.migrationRequestId },
      data: { status: MigrationStatus.RUNNING, needsAttention: false, currentStep: 'worker-queue', completedAt: null },
    });
    await this.audit.record({
      action: MigrationActions.MIGRATION_WORKER_JOB_RETRIED,
      actorUserId: opts.actorUserId,
      details: { migrationRequestId: opts.migrationRequestId, jobId: job.id, kind: job.kind },
    });
    return this.toJobView(updated);
  }

  /**
   * Delta-sync przed cutoverem: ponowny rsync plików + dosync poczty.
   * Dostępne dla zakończonych migracji — imapsync i mirror są idempotentne,
   * dociągają wyłącznie różnice od pierwszego transferu.
   */
  async queueDeltaSync(
    subscriptionId: string,
    userId: string,
    migrationRequestId: string,
  ): Promise<MigrationBundleDetail> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    const request = await this.prisma.migrationRequest.findFirst({
      where: { id: migrationRequestId, subscriptionId },
      include: { workerJobs: true },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    if (request.status !== MigrationStatus.COMPLETED) {
      throw new BadRequestException('Delta-sync jest dostępny po zakończeniu pierwszego transferu.');
    }
    if (request.secretsPurgedAt) {
      throw new BadRequestException(
        'Dane dostępowe tej migracji zostały usunięte po okresie retencji — delta-sync nie jest już możliwy. ' +
          'Zleć nową migrację, jeśli potrzebujesz dograć zmiany.',
      );
    }
    const pendingDelta = request.workerJobs.some(
      (j) =>
        (j.kind === MigrationWorkerJobKind.FILES_DELTA || j.kind === MigrationWorkerJobKind.IMAP_DELTA) &&
        (j.status === MigrationWorkerJobStatus.QUEUED ||
          j.status === MigrationWorkerJobStatus.RUNNING ||
          j.status === MigrationWorkerJobStatus.RETRYING),
    );
    if (pendingDelta) {
      throw new BadRequestException('Delta-sync jest już w kolejce.');
    }

    const bundle = JSON.parse(this.crypto.decrypt(request.sourceBundleEnc)) as {
      ftp?: unknown | null;
      imap?: unknown[] | null;
    };
    const stamp = Date.now();
    const maxSeq = Math.max(0, ...request.workerJobs.map((j) => j.sequence));
    const jobs: Prisma.MigrationWorkerJobCreateManyInput[] = [];
    if (bundle.ftp) {
      jobs.push({
        migrationRequestId: request.id,
        kind: MigrationWorkerJobKind.FILES_DELTA,
        status: MigrationWorkerJobStatus.QUEUED,
        idempotencyKey: `migration:${subscriptionId}:${stamp}:files-delta`,
        sequence: maxSeq + 10,
        payload: { delta: true },
      });
    }
    (bundle.imap ?? []).forEach((_, index) => {
      jobs.push({
        migrationRequestId: request.id,
        kind: MigrationWorkerJobKind.IMAP_DELTA,
        status: MigrationWorkerJobStatus.QUEUED,
        idempotencyKey: `migration:${subscriptionId}:${stamp}:imap-delta:${index}`,
        sequence: maxSeq + 20 + index,
        payload: { index, delta: true },
      });
    });
    if (jobs.length === 0) {
      throw new BadRequestException('To zlecenie nie ma źródeł plików ani poczty do delta-synca.');
    }

    await this.prisma.$transaction([
      this.prisma.migrationWorkerJob.createMany({ data: jobs }),
      this.prisma.migrationRequest.update({
        where: { id: request.id },
        data: { status: MigrationStatus.RUNNING, currentStep: 'delta', completedAt: null },
      }),
      this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId,
          type: 'MIGRATION_DELTA_SYNC_QUEUED',
          details: { migrationRequestId: request.id, jobs: jobs.length },
        },
      }),
    ]);

    await this.audit.record({
      action: MigrationActions.MIGRATION_DELTA_SYNC_QUEUED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, migrationRequestId: request.id, jobs: jobs.length },
    });

    return this.getBundleDetailForUser(subscriptionId, userId, request.id);
  }

  /**
   * Anulowanie migracji przez klienta. Dozwolone gdy w toku/oczekuje/eskalacja.
   * Zamykamy zlecenie i wszystkie nieukończone joby (worker przestaje je
   * leasować; job będący akurat w locie zamknie się jako CANCELED przez guard
   * w complete/fail). Idempotentne dla już zakończonych → błąd czytelny.
   */
  async cancelBundle(
    subscriptionId: string,
    userId: string,
    migrationRequestId: string,
  ): Promise<MigrationBundleDetail> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    const request = await this.prisma.migrationRequest.findFirst({
      where: { id: migrationRequestId, subscriptionId },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    const cancelable: MigrationStatus[] = [
      MigrationStatus.QUEUED,
      MigrationStatus.RUNNING,
      MigrationStatus.ATTENTION,
    ];
    if (!cancelable.includes(request.status)) {
      throw new BadRequestException(
        'Tej migracji nie można już anulować (jest zakończona lub anulowana).',
      );
    }

    await this.prisma.$transaction([
      this.prisma.migrationWorkerJob.updateMany({
        where: {
          migrationRequestId: request.id,
          status: {
            in: [
              MigrationWorkerJobStatus.QUEUED,
              MigrationWorkerJobStatus.RUNNING,
              MigrationWorkerJobStatus.RETRYING,
            ],
          },
        },
        data: { status: MigrationWorkerJobStatus.CANCELED, completedAt: new Date() },
      }),
      this.prisma.migrationRequest.update({
        where: { id: request.id },
        data: {
          status: MigrationStatus.CANCELED,
          needsAttention: false,
          attentionReason: null,
          currentStep: 'canceled',
          completedAt: new Date(),
        },
      }),
      this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId,
          type: 'MIGRATION_CANCELED',
          details: { migrationRequestId: request.id, canceledBy: 'client' },
        },
      }),
    ]);

    await this.audit.record({
      action: MigrationActions.MIGRATION_CANCELED,
      userId,
      actorUserId: userId,
      details: { subscriptionId, migrationRequestId: request.id },
    });

    return this.getBundleDetailForUser(subscriptionId, userId, request.id);
  }

  /** Szczegóły zlecenia + kroki (bez sekretów) — widok klienta i staffa. */
  async getBundleDetailForUser(
    subscriptionId: string,
    userId: string,
    migrationRequestId: string,
  ): Promise<MigrationBundleDetail> {
    await this.assertSubscriptionForUser(subscriptionId, userId);
    const request = await this.prisma.migrationRequest.findFirst({
      where: { id: migrationRequestId, subscriptionId },
      include: { workerJobs: { orderBy: { sequence: 'asc' } } },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    return {
      ...this.toSummary(request),
      jobs: request.workerJobs.map((j) => this.toJobView(j)),
    };
  }

  /** Szczegóły zlecenia dla staffa (z logami jobów). */
  async getBundleDetailForStaff(migrationRequestId: string) {
    const request = await this.prisma.migrationRequest.findUnique({
      where: { id: migrationRequestId },
      include: {
        workerJobs: { orderBy: { sequence: 'asc' } },
        subscription: {
          include: {
            account: true,
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            plan: { select: { name: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Migration request not found');
    return {
      ...this.toSummary(request),
      clientEmail: request.subscription.user.email,
      clientName:
        [request.subscription.user.firstName, request.subscription.user.lastName]
          .filter(Boolean)
          .join(' ') || null,
      clientUserId: request.subscription.user.id,
      planName: request.subscription.plan?.name ?? null,
      accountDomain: request.subscription.account?.domain ?? null,
      accountUsername: request.subscription.account?.daUsername ?? null,
      serverId: request.subscription.account?.serverId ?? null,
      subscriptionId: request.subscriptionId,
      // Dane wprowadzone przez klienta w formularzu migracyjnym — BEZ haseł.
      // Hasła nadal dostępne wyłącznie przez audytowane `revealSecretsForStaff`.
      // Po retencji (secretsPurgedAt) bundle jest pusty — sygnalizujemy to staffowi.
      secretsPurgedAt: request.secretsPurgedAt?.toISOString() ?? null,
      sourceForm: request.secretsPurgedAt ? null : this.decodeSanitizedBundle(request.sourceBundleEnc),
      jobs: request.workerJobs.map((j) => ({
        ...this.toJobView(j),
        log: j.log,
        workerId: j.workerId,
        payload: this.sanitizeJobPayload(j.payload),
      })),
    };
  }

  /**
   * Odszyfrowuje bundle i zwraca podgląd danych z formularza klienta bez
   * jakichkolwiek sekretów (hasła zamienione na `••••••`). Do panelu staffa,
   * żeby operator widział u góry komplet wprowadzonych danych i miał kontrolę
   * nad każdym elementem osobno.
   */
  private decodeSanitizedBundle(sourceBundleEnc: string): {
    targetDomain: string | null;
    sourceDomain: string | null;
    notes: string | null;
    ftp: {
      protocol: string;
      host: string;
      port: number;
      username: string;
      remotePath: string;
      hasPassword: boolean;
    } | null;
    mysql: Array<{ host: string; port: number; database: string; username: string; hasPassword: boolean }>;
    imap: Array<{ host: string; port: number; email: string; username: string; hasPassword: boolean }>;
    submittedAt: string | null;
  } | null {
    let bundle: {
      targetDomain?: string | null;
      sourceDomain?: string | null;
      notes?: string | null;
      submittedAt?: string | null;
      ftp?: {
        protocol?: string;
        host?: string;
        port?: number;
        username?: string;
        remotePath?: string;
        password?: string;
      } | null;
      mysql?: Array<{ host?: string; port?: number; database?: string; username?: string; password?: string }>;
      imap?: Array<{ host?: string; port?: number; email?: string; username?: string; password?: string }>;
    };
    try {
      bundle = JSON.parse(this.crypto.decrypt(sourceBundleEnc));
    } catch {
      return null;
    }
    return {
      targetDomain: bundle.targetDomain ?? null,
      sourceDomain: bundle.sourceDomain ?? null,
      notes: bundle.notes ?? null,
      submittedAt: bundle.submittedAt ?? null,
      ftp: bundle.ftp
        ? {
            protocol: bundle.ftp.protocol ?? 'sftp',
            host: bundle.ftp.host ?? '',
            port: bundle.ftp.port ?? 0,
            username: bundle.ftp.username ?? '',
            remotePath: bundle.ftp.remotePath ?? '/',
            hasPassword: !!bundle.ftp.password,
          }
        : null,
      mysql: (bundle.mysql ?? []).map((m) => ({
        host: m.host ?? '',
        port: m.port ?? 0,
        database: m.database ?? '',
        username: m.username ?? '',
        hasPassword: !!m.password,
      })),
      imap: (bundle.imap ?? []).map((m) => ({
        host: m.host ?? '',
        port: m.port ?? 0,
        email: m.email ?? m.username ?? '',
        username: m.username ?? '',
        hasPassword: !!m.password,
      })),
    };
  }

  /** Payload joba do panelu staffa bez sekretów docelowych (hasła baz DA). */
  private sanitizeJobPayload(payload: Prisma.JsonValue | null): Prisma.JsonValue | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const clone: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    if ('password' in clone) clone.password = '••••••';
    if (clone.targetDb && typeof clone.targetDb === 'object') {
      clone.targetDb = { ...(clone.targetDb as Record<string, unknown>), password: '••••••' };
    }
    return clone as Prisma.JsonValue;
  }

  async completeWorkerJobFromNode(opts: {
    serverId: string;
    jobId: string;
    bytesTransferred: bigint;
    filesTransferred: number;
    databasesMigrated?: number;
    mailboxesMigrated?: number;
    log?: string | null;
    integrity?: Record<string, unknown> | null;
  }) {
    const job = await this.assertWorkerJobForServer(opts.serverId, opts.jobId);
    // Zapis raportu spójności do payloadu joba (obok progressu).
    const basePayload =
      job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : {};
    const nextPayload = {
      ...basePayload,
      ...(opts.integrity ? { integrity: opts.integrity } : {}),
    } as Prisma.InputJsonValue;
    const updated = await this.prisma.$transaction(async (tx) => {
      const workerJob = await tx.migrationWorkerJob.update({
        where: { id: job.id },
        data: {
          status: MigrationWorkerJobStatus.COMPLETED,
          completedAt: new Date(),
          log: trimWorkerLog(opts.log),
          lastError: null,
          payload: nextPayload,
        },
      });
      const remaining = await tx.migrationWorkerJob.count({
        where: {
          migrationRequestId: job.migrationRequestId,
          id: { not: job.id },
          status: { in: [MigrationWorkerJobStatus.QUEUED, MigrationWorkerJobStatus.RUNNING, MigrationWorkerJobStatus.RETRYING] },
        },
      });
      // Jeśli klient w międzyczasie anulował zlecenie, nie wskrzeszamy statusu —
      // liczniki nadal zliczamy (audyt tego, co worker zdążył przenieść).
      const current = await tx.migrationRequest.findUnique({
        where: { id: job.migrationRequestId },
        select: { status: true },
      });
      const canceled = current?.status === MigrationStatus.CANCELED;
      await tx.migrationRequest.update({
        where: { id: job.migrationRequestId },
        data: {
          status: canceled
            ? MigrationStatus.CANCELED
            : remaining === 0
              ? MigrationStatus.COMPLETED
              : MigrationStatus.RUNNING,
          currentStep: canceled ? 'canceled' : remaining === 0 ? 'done' : 'worker-queue',
          bytesTransferred: { increment: opts.bytesTransferred },
          filesTransferred: { increment: opts.filesTransferred },
          databasesMigrated: { increment: opts.databasesMigrated ?? 0 },
          mailboxesMigrated: { increment: opts.mailboxesMigrated ?? 0 },
          completedAt: canceled || remaining === 0 ? new Date() : null,
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

    // Zlecenie anulowane w międzyczasie — nie ponawiamy i nie eskalujemy.
    // Job zamykamy jako CANCELED, request zostaje CANCELED.
    if (job.migrationRequest.status === MigrationStatus.CANCELED) {
      await this.prisma.migrationWorkerJob.update({
        where: { id: job.id },
        data: {
          status: MigrationWorkerJobStatus.CANCELED,
          lastError: opts.error,
          log: trimWorkerLog(opts.log),
          completedAt: new Date(),
        },
      });
      return { ok: true as const, status: MigrationWorkerJobStatus.CANCELED };
    }

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
      if (nextStatus === MigrationWorkerJobStatus.RETRYING) {
        await tx.migrationRequest.update({
          where: { id: job.migrationRequestId },
          data: {
            status: MigrationStatus.RUNNING,
            currentStep: workerStep(job.kind),
            lastError: opts.error,
          },
        });
      }
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

    // Wyczerpane próby = automat staje, zlecenie idzie do staffa jako „Pilne”.
    if (nextStatus === MigrationWorkerJobStatus.FAILED) {
      await this.escalateToStaff(
        job.migrationRequestId,
        `Krok ${workerStep(job.kind)} nie powiódł się po ${job.attempts}/${job.maxAttempts} próbach: ${opts.error}`,
      );
    }
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
    sourcePanelType: string | null;
    needsAttention: boolean;
    attentionReason: string | null;
    cutoverMode: string | null;
    cutoverAt: Date | null;
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
      sourcePanelType: row.sourcePanelType,
      needsAttention: row.needsAttention,
      attentionReason: row.attentionReason,
      cutoverMode: row.cutoverMode,
      cutoverAt: row.cutoverAt?.toISOString() ?? null,
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

  private toJobView(job: {
    id: string;
    kind: MigrationWorkerJobKind;
    status: MigrationWorkerJobStatus;
    sequence: number;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    payload: Prisma.JsonValue | null;
    lastHeartbeatAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
  }): MigrationJobView {
    let progress: MigrationJobView['progress'] = null;
    let integrity: Record<string, unknown> | null = null;
    if (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)) {
      const payloadObj = job.payload as Record<string, unknown>;
      const raw = payloadObj.progress;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const p = raw as Record<string, unknown>;
        progress = {
          bytes: String(p.bytes ?? '0'),
          files: Number(p.files ?? 0),
          note: typeof p.note === 'string' ? p.note : null,
          at: String(p.at ?? ''),
        };
      }
      if (payloadObj.integrity && typeof payloadObj.integrity === 'object' && !Array.isArray(payloadObj.integrity)) {
        integrity = payloadObj.integrity as Record<string, unknown>;
      }
    }
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      sequence: job.sequence,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      progress,
      integrity,
      lastHeartbeatAt: job.lastHeartbeatAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
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

/**
 * Kolejność kroków (pole `sequence`): pliki → bazy → WP fixup → poczta →
 * post-check HTTP. Lease wykonuje kroki jednego zlecenia ściśle po kolei,
 * dzięki czemu WP_FIXUP zawsze widzi już zaimportowane pliki i bazy.
 */
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
      sequence: 10,
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
      sequence: 20 + index,
      payload: { index, database: source.database, targetDomain },
    });
  });
  // WP fixup ma sens tylko, gdy przenosimy i pliki, i bazę.
  if (dto.ftp && (dto.mysql?.length ?? 0) > 0) {
    jobs.push({
      kind: MigrationWorkerJobKind.WP_FIXUP,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:wp-fixup`,
      sequence: 50,
      payload: {
        targetDomain,
        sourceDomain: dto.sourceDomain ?? null,
        sourceDatabases: (dto.mysql ?? []).map((m) => m.database),
      },
    });
  }
  dto.imap?.forEach((source, index) => {
    jobs.push({
      kind: MigrationWorkerJobKind.IMAP_SYNC,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:imap:${index}`,
      sequence: 60 + index,
      payload: { index, username: source.username, targetDomain },
    });
  });
  if (targetDomain) {
    jobs.push({
      kind: MigrationWorkerJobKind.HTTP_POST_CHECK,
      status: MigrationWorkerJobStatus.QUEUED,
      idempotencyKey: `migration:${subscriptionId}:${stamp}:http-post-check`,
      sequence: 90,
      payload: { targetDomain, url: `https://${targetDomain}` },
    });
  }
  return jobs;
}

function workerStep(kind: MigrationWorkerJobKind): string {
  switch (kind) {
    case MigrationWorkerJobKind.FILES_SFTP_RSYNC:
      return 'files';
    case MigrationWorkerJobKind.FILES_DELTA:
      return 'files-delta';
    case MigrationWorkerJobKind.MYSQL_IMPORT:
      return 'mysql';
    case MigrationWorkerJobKind.WP_FIXUP:
      return 'wp-fixup';
    case MigrationWorkerJobKind.IMAP_SYNC:
      return 'imap';
    case MigrationWorkerJobKind.IMAP_DELTA:
      return 'imap-delta';
    case MigrationWorkerJobKind.HTTP_POST_CHECK:
      return 'http-post-check';
  }
}


import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostingRestoreStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';

const ACTIVE_STATUSES: HostingRestoreStatus[] = [
  HostingRestoreStatus.QUEUED,
  HostingRestoreStatus.RUNNING,
  HostingRestoreStatus.SAFETY_BACKUP,
  HostingRestoreStatus.RESTORING,
];

export interface EnqueueRestoreInput {
  backupId: string;
  scopeFiles?: boolean;
  scopeDatabases?: boolean;
  scopeEmail?: boolean;
  safetyBackup?: boolean;
  /** Required for client-initiated restores: must equal the account domain. */
  confirmDomain?: string;
  isAdmin?: boolean;
}

@Injectable()
export class HostingRestoreService {
  private readonly logger = new Logger(HostingRestoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async enqueue(subscriptionId: string, requestingUserId: string, input: EnqueueRestoreInput) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: true },
    });
    if (!sub?.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    const account = sub.account;

    if (!input.isAdmin && account.userId !== requestingUserId) {
      throw new ForbiddenException('Brak dostępu do tej usługi.');
    }

    const scopeFiles = input.scopeFiles ?? true;
    const scopeDatabases = input.scopeDatabases ?? true;
    const scopeEmail = input.scopeEmail ?? true;
    if (!scopeFiles && !scopeDatabases && !scopeEmail) {
      throw new BadRequestException('Wybierz przynajmniej jeden zakres przywracania.');
    }

    // Client-initiated restores require an explicit domain confirmation since
    // the operation overwrites live data.
    if (!input.isAdmin) {
      const confirm = (input.confirmDomain ?? '').trim().toLowerCase();
      if (confirm !== account.domain.toLowerCase()) {
        throw new BadRequestException(
          'Aby potwierdzić nadpisanie danych, wpisz dokładną nazwę domeny usługi.',
        );
      }
    }

    const active = await this.prisma.hostingRestoreJob.findFirst({
      where: { subscriptionId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) {
      throw new ConflictException('Przywracanie jest już w toku dla tej usługi.');
    }

    // Validate the backup exists in the live DA list.
    const backups = await this.directAdmin.listHostingBackups(subscriptionId, account.userId);
    if (backups.fetchError) {
      throw new BadRequestException(`Nie udało się pobrać listy backupów: ${backups.fetchError}`);
    }
    const backup = backups.rows.find(
      (r) => r.id === input.backupId || r.fileName === input.backupId,
    );
    if (!backup) {
      throw new BadRequestException('Wybrany backup nie istnieje na koncie.');
    }

    const job = await this.prisma.hostingRestoreJob.create({
      data: {
        subscriptionId,
        requestedByUserId: requestingUserId,
        isAdminInitiated: Boolean(input.isAdmin),
        backupId: backup.id,
        backupFileName: backup.fileName,
        scopeFiles,
        scopeDatabases,
        scopeEmail,
        safetyBackup: input.safetyBackup ?? true,
      },
    });

    await this.audit.record({
      action: 'HOSTING_RESTORE_QUEUED',
      userId: account.userId,
      actorUserId: requestingUserId,
      details: {
        jobId: job.id,
        subscriptionId,
        backupFileName: backup.fileName,
        scope: { files: scopeFiles, databases: scopeDatabases, email: scopeEmail },
        safetyBackup: job.safetyBackup,
        isAdminInitiated: job.isAdminInitiated,
      } as Prisma.InputJsonValue,
    });

    return this.toPublic(job);
  }

  async latestForSubscription(subscriptionId: string, requestingUserId: string, isAdmin = false) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: { select: { userId: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!isAdmin && sub.account?.userId !== requestingUserId) {
      throw new ForbiddenException('Brak dostępu do tej usługi.');
    }
    const job = await this.prisma.hostingRestoreJob.findFirst({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
    return job ? this.toPublic(job) : null;
  }

  /**
   * Worker step: claims and processes one queued job. Returns true if a job was
   * processed. Designed to be called from a 1-minute cron with a busy guard so
   * only one restore runs at a time (restores are heavy and overwrite data).
   */
  async processNextQueued(): Promise<boolean> {
    const job = await this.prisma.hostingRestoreJob.findFirst({
      where: { status: HostingRestoreStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return false;

    // Atomic claim: only proceed if still QUEUED.
    const claimed = await this.prisma.hostingRestoreJob.updateMany({
      where: { id: job.id, status: HostingRestoreStatus.QUEUED },
      data: { status: HostingRestoreStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    const account = await this.prisma.account.findUnique({
      where: { subscriptionId: job.subscriptionId },
      select: { userId: true, domain: true },
    });
    if (!account) {
      await this.fail(job.id, job.subscriptionId, 'Konto hostingowe nie istnieje.');
      return true;
    }

    try {
      if (job.safetyBackup) {
        await this.setStatus(job.id, HostingRestoreStatus.SAFETY_BACKUP);
        await this.directAdmin.createHostingSiteBackupNow(job.subscriptionId, account.userId);
      }

      await this.setStatus(job.id, HostingRestoreStatus.RESTORING);
      await this.directAdmin.restoreHostingBackup(job.subscriptionId, account.userId, {
        fileName: job.backupFileName,
        files: job.scopeFiles,
        databases: job.scopeDatabases,
        email: job.scopeEmail,
      });

      await this.prisma.hostingRestoreJob.update({
        where: { id: job.id },
        data: { status: HostingRestoreStatus.COMPLETED, completedAt: new Date(), error: null },
      });
      await this.audit.record({
        action: 'HOSTING_RESTORE_COMPLETED',
        userId: account.userId,
        actorUserId: job.requestedByUserId,
        details: {
          jobId: job.id,
          subscriptionId: job.subscriptionId,
          backupFileName: job.backupFileName,
          safetyBackup: job.safetyBackup,
        } as Prisma.InputJsonValue,
      });
    } catch (err) {
      await this.fail(job.id, job.subscriptionId, (err as Error).message, account.userId, job.requestedByUserId);
    }
    return true;
  }

  private async setStatus(id: string, status: HostingRestoreStatus): Promise<void> {
    await this.prisma.hostingRestoreJob.update({ where: { id }, data: { status } });
  }

  private async fail(
    id: string,
    subscriptionId: string,
    message: string,
    userId?: string,
    actorUserId?: string,
  ): Promise<void> {
    this.logger.error(`Hosting restore job=${id} failed: ${message}`);
    await this.prisma.hostingRestoreJob.update({
      where: { id },
      data: { status: HostingRestoreStatus.FAILED, error: message.slice(0, 2000), completedAt: new Date() },
    });
    await this.audit.record({
      action: 'HOSTING_RESTORE_FAILED',
      userId: userId ?? null,
      actorUserId: actorUserId ?? null,
      details: { jobId: id, subscriptionId, error: message } as Prisma.InputJsonValue,
    });
  }

  private toPublic(job: {
    id: string;
    status: HostingRestoreStatus;
    backupFileName: string;
    scopeFiles: boolean;
    scopeDatabases: boolean;
    scopeEmail: boolean;
    safetyBackup: boolean;
    isAdminInitiated: boolean;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: job.id,
      status: job.status,
      backupFileName: job.backupFileName,
      scope: { files: job.scopeFiles, databases: job.scopeDatabases, email: job.scopeEmail },
      safetyBackup: job.safetyBackup,
      isAdminInitiated: job.isAdminInitiated,
      error: job.error,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      active: ACTIVE_STATUSES.includes(job.status),
    };
  }
}

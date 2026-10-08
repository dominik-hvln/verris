import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostingRestoreStatus, Prisma } from '@verris/database';
import { daErrorMessage } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';

/** H-09 — jak długo czekamy na kopię bezpieczeństwa, zanim odmówimy nadpisania danych. */
const SAFETY_BACKUP_TIMEOUT_MS = 15 * 60_000;
const SAFETY_BACKUP_POLL_MS = 20_000;
/** Ile czekamy na potwierdzenie od serwera, zanim powiemy klientowi, że coś jest nie tak. */
const POTWIERDZENIE_MAX_MS = 2 * 60 * 60_000;
/**
 * Panel serwera po odtworzeniu wysyła do konta wiadomość systemową (t1 01.10: „Pliki użytkownika zostały
 * przywrócone z kopii zapasowej”; węzeł w innym języku — „…restored…”). Na niej opieramy „Gotowe”.
 */
const ODTWORZONO = /przywr|restor/i;
const BLAD_SERWERA = /bł[aąeę]d|nie powiod|niepowodz|nieudan|nie udał|error|fail/i;

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
  /** PB-44 — powód operatora (staff musi go podać); trafia do dziennika. */
  reason?: string;
}

@Injectable()
export class HostingRestoreService {
  private readonly logger = new Logger(HostingRestoreService.name);
  /** Podmieniane w testach. */
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
        reason: input.reason?.trim() || null,
      } as Prisma.InputJsonValue,
    });

    return this.toPublic(job, Boolean(input.isAdmin));
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
    return job ? this.toPublic(job, isAdmin) : null;
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
        await this.takeSafetyBackup(job.subscriptionId, account.userId);
      }

      await this.setStatus(job.id, HostingRestoreStatus.RESTORING);
      await this.directAdmin.restoreHostingBackup(job.subscriptionId, account.userId, {
        fileName: job.backupFileName,
        files: job.scopeFiles,
        databases: job.scopeDatabases,
        email: job.scopeEmail,
      });
      // Serwer tylko przyjął zlecenie do swojej kolejki — „Gotowe” dopiero po jego potwierdzeniu
      // (potwierdzOdtworzenia). Wcześniej status kończył się tu na „zlecone”, a klient nie wiedział,
      // czy dane już wróciły (uwaga właściciela 01.10). updatedAt = chwila zlecenia.
      await this.prisma.hostingRestoreJob.update({ where: { id: job.id }, data: { error: null } });
    } catch (err) {
      await this.fail(job.id, job.subscriptionId, (err as Error).message, account.userId, job.requestedByUserId);
    }
    return true;
  }

  /**
   * Zadania zlecone serwerowi (RESTORING) czekają na jego wiadomość „przywrócono” nowszą niż zlecenie.
   * Wołane co minutę przez scheduler. Wiadomość o błędzie albo brak potwierdzenia przez 2 h → FAILED
   * z wyjaśnieniem dla klienta.
   */
  async potwierdzOdtworzenia(teraz = new Date()): Promise<void> {
    const zadania = await this.prisma.hostingRestoreJob.findMany({
      where: { status: HostingRestoreStatus.RESTORING },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const job of zadania) {
      const zlecono = job.updatedAt;
      try {
        const account = await this.prisma.account.findUnique({
          where: { subscriptionId: job.subscriptionId },
          select: { id: true, userId: true },
        });
        if (!account) continue;
        const client = await this.directAdmin.getClientForHostingAccount(account.id, account.userId);
        const kandydaci = (await client.listMessages())
          .filter((m) => ODTWORZONO.test(m.subject))
          .sort((a, b) => b.number - a.number)
          .slice(0, 5);
        for (const m of kandydaci) {
          const w = await client.getMessage(m.id);
          // minuta zapasu na różnicę zegarów control-plane i węzła
          if (!w.time || w.time.getTime() < zlecono.getTime() - 60_000) continue;
          if (BLAD_SERWERA.test(m.subject)) {
            await this.fail(job.id, job.subscriptionId, `Serwer zgłosił błąd odtwarzania: ${m.subject}`, account.userId, job.requestedByUserId);
          } else {
            await this.zakoncz(job, account.userId, w.time);
          }
          break;
        }
      } catch (err) {
        this.logger.warn(`Potwierdzenie odtworzenia job=${job.id}: ${(err as Error).message}`);
      }
      const odswiezone = await this.prisma.hostingRestoreJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (odswiezone?.status === HostingRestoreStatus.RESTORING && teraz.getTime() - zlecono.getTime() > POTWIERDZENIE_MAX_MS) {
        await this.fail(
          job.id,
          job.subscriptionId,
          'Serwer nie potwierdził odtworzenia w ciągu 2 godzin — sprawdź dane albo napisz do nas, sprawdzimy to.',
          undefined,
          job.requestedByUserId,
        );
      }
    }
  }

  private async zakoncz(
    job: { id: string; subscriptionId: string; requestedByUserId: string; backupFileName: string; safetyBackup: boolean },
    userId: string,
    kiedy: Date,
  ): Promise<void> {
    await this.prisma.hostingRestoreJob.update({
      where: { id: job.id },
      data: { status: HostingRestoreStatus.COMPLETED, completedAt: kiedy, error: null },
    });
    await this.audit.record({
      action: 'HOSTING_RESTORE_COMPLETED',
      userId,
      actorUserId: job.requestedByUserId,
      details: {
        jobId: job.id,
        subscriptionId: job.subscriptionId,
        backupFileName: job.backupFileName,
        safetyBackup: job.safetyBackup,
      } as Prisma.InputJsonValue,
    });
  }

  /**
   * H-09 — DirectAdmin tylko KOLEJKUJE kopię. Wcześniej odtwarzanie ruszało
   * zaraz potem, nawet gdy kopia się nie udała — czyli nadpisywało dane bez
   * siatki. Teraz czekamy, aż na liście pojawi się NOWE archiwum; bez niego
   * odtworzenie się nie zaczyna.
   * ponytail: czekanie blokuje worker (jedno odtwarzanie naraz i tak jest
   * zasadą); przy kolejce odtworzeń — stan SAFETY_BACKUP rozpisany na ticki crona.
   */
  private async takeSafetyBackup(subscriptionId: string, userId: string): Promise<void> {
    const before = await this.directAdmin.listHostingBackups(subscriptionId, userId);
    if (before.fetchError) {
      this.logger.warn(`Hosting restore sub=${subscriptionId}: lista kopii niedostępna: ${before.fetchError}`);
      throw new Error('Nie da się odczytać listy kopii — przywracanie wstrzymane, dane nie zostały zmienione.');
    }
    const known = new Set(before.rows.map((r) => r.fileName));
    await this.directAdmin.createHostingSiteBackupNow(subscriptionId, userId);
    for (let waited = 0; waited < SAFETY_BACKUP_TIMEOUT_MS; waited += SAFETY_BACKUP_POLL_MS) {
      await this.sleep(SAFETY_BACKUP_POLL_MS);
      const now = await this.directAdmin.listHostingBackups(subscriptionId, userId);
      if (!now.fetchError && now.rows.some((r) => !known.has(r.fileName))) return;
    }
    throw new Error('Kopia bezpieczeństwa nie powstała w ciągu 15 minut — przywracanie wstrzymane, dane nie zostały zmienione.');
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

  /** `job.error` to surowy tekst z serwera hostingowego — klient dostaje wersję oczyszczoną, administrator całość. */
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
  }, pokazSurowy = false) {
    return {
      id: job.id,
      status: job.status,
      backupFileName: job.backupFileName,
      scope: { files: job.scopeFiles, databases: job.scopeDatabases, email: job.scopeEmail },
      safetyBackup: job.safetyBackup,
      isAdminInitiated: job.isAdminInitiated,
      error: job.error && !pokazSurowy ? daErrorMessage(job.error) : job.error,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      active: ACTIVE_STATUSES.includes(job.status),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MigrationStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { MigrationOrchestratorService } from './migration-orchestrator.service';

function formatBytes(value: bigint): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

@Injectable()
export class MigrationWorkerScheduler {
  private readonly logger = new Logger(MigrationWorkerScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly orchestrator: MigrationOrchestratorService,
  ) {}

  /**
   * Migrator v2 — pełny automat (bez bramki operatora):
   * - QUEUED -> DA pre-backup konta docelowego (bezpiecznik przed nadpisaniem)
   *   i od razu RUNNING `worker-queue`; transfer wykonuje worker na nodzie.
   * - COMPLETED -> e-mail z podsumowaniem + instrukcją cutoveru DNS.
   * - ATTENTION -> automat stanął; klient dostaje e-mail, staff „Pilne”.
   * Ticket powstaje wyłącznie przy eskalacji (escalateToStaff).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processMigrationRequests(): Promise<void> {
    const queued = await this.prisma.migrationRequest.findMany({
      where: { status: MigrationStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: 10,
      include: {
        subscription: {
          include: { account: true, user: { select: { id: true, email: true, firstName: true } } },
        },
      },
    });

    for (const req of queued) {
      try {
        await this.directAdmin.createHostingSiteBackupNow(
          req.subscriptionId,
          req.userId,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`migration bundle pre-backup failed request=${req.id}: ${msg}`);
        // Bezpiecznik nie zadziałał — nie nadpisujemy konta automatem.
        await this.orchestrator.escalateToStaff(
          req.id,
          `Pre-backup konta docelowego w DirectAdmin nie powiódł się: ${msg}`,
        );
        continue;
      }

      try {
        // Bazy docelowe przez DA API (widoczne w panelu, creds do wp-config).
        await this.orchestrator.prepareMysqlTargets(req.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`migration mysql target provisioning failed request=${req.id}: ${msg}`);
        await this.orchestrator.escalateToStaff(
          req.id,
          `Nie udało się utworzyć baz docelowych w DirectAdmin: ${msg}`,
        );
        continue;
      }

      await this.prisma.migrationRequest.update({
        where: { id: req.id },
        data: {
          status: MigrationStatus.RUNNING,
          currentStep: 'worker-queue',
          startedAt: new Date(),
        },
      });
      await this.audit.record({
        action: 'MIGRATION_BUNDLE_PICKED_UP',
        userId: req.userId,
        actorUserId: null,
        details: {
          subscriptionId: req.subscriptionId,
          migrationRequestId: req.id,
          mode: 'auto',
        },
      });
    }

    // Sprint 7 / R-MIG-5 — post-check + powiadomienia po zakończeniu/awarii.
    const finished = await this.prisma.migrationRequest.findMany({
      where: {
        status: { in: [MigrationStatus.COMPLETED, MigrationStatus.FAILED] },
        completedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        currentStep: { not: 'notified' },
      },
      take: 20,
      include: {
        subscription: {
          include: { account: true, user: { select: { email: true, firstName: true } } },
        },
      },
    });
    for (const row of finished) {
      const ok = row.status === MigrationStatus.COMPLETED;
      try {
        await this.mailer.send({
          to: row.subscription.user.email,
          subject: ok
            ? `Migracja zakończona sukcesem — ${row.subscription.account?.domain ?? row.targetDomain ?? '—'}`
            : `Migracja zakończona błędem — wymaga uwagi`,
          text: ok
            ? this.buildSuccessMail(row, row.subscription.user.firstName)
            : this.buildFailureMail(row, row.subscription.user.firstName),
          tag: ok ? 'migration.completed' : 'migration.failed',
          category: 'TRANSACTIONAL',
          fromRole: 'NOREPLY',
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send migration ${ok ? 'success' : 'failure'} mail for request=${row.id}: ${(err as Error).message}`,
        );
      }
      await this.prisma.migrationRequest.update({
        where: { id: row.id },
        data: { currentStep: 'notified' },
      });
    }

    // Eskalacje (ATTENTION) — klient dostaje uspokajający e-mail; dedupe przez event.
    const escalated = await this.prisma.migrationRequest.findMany({
      where: {
        status: MigrationStatus.ATTENTION,
        attentionAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      take: 20,
      include: {
        subscription: {
          include: { account: true, user: { select: { email: true, firstName: true } } },
        },
      },
    });
    for (const row of escalated) {
      const alreadyNotified = await this.prisma.subscriptionEvent.findFirst({
        where: {
          subscriptionId: row.subscriptionId,
          type: 'MIGRATION_ATTENTION_NOTIFIED',
          details: { path: ['migrationRequestId'], equals: row.id },
        },
        select: { id: true },
      });
      if (alreadyNotified) continue;
      try {
        await this.mailer.send({
          to: row.subscription.user.email,
          subject: `Migracja ${row.targetDomain ?? row.subscription.account?.domain ?? ''} — przejął ją nasz zespół`,
          text: this.buildAttentionMail(row, row.subscription.user.firstName),
          tag: 'migration.attention',
          category: 'TRANSACTIONAL',
          fromRole: 'NOREPLY',
        });
      } catch (err) {
        this.logger.warn(`Failed to send migration attention mail request=${row.id}: ${(err as Error).message}`);
      }
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: row.subscriptionId,
          type: 'MIGRATION_ATTENTION_NOTIFIED',
          details: { migrationRequestId: row.id },
        },
      });
    }
  }

  /** Watchdog — joby bez heartbeatu wracają do kolejki albo eskalują zlecenie. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async watchdogStalledJobs(): Promise<void> {
    const result = await this.orchestrator.requeueOrEscalateStalledJobs();
    if (result.requeued > 0 || result.escalated > 0) {
      this.logger.warn(
        `migration watchdog: requeued=${result.requeued} escalated=${result.escalated}`,
      );
    }
  }

  /** Retencja sekretów — czyści hasła źródła po oknie od zakończenia migracji. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeMigrationSecrets(): Promise<void> {
    try {
      await this.orchestrator.purgeExpiredSecrets();
    } catch (err) {
      this.logger.warn(`migration secret purge failed: ${(err as Error).message}`);
    }
  }

  private buildAttentionMail(
    req: { id: string; targetDomain: string | null; subscription: { account: { domain: string } | null } },
    firstName: string | null,
  ): string {
    return [
      `${firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,'}`,
      '',
      `automatyczna migracja ${req.targetDomain ?? req.subscription.account?.domain ?? ''} napotkała przeszkodę,`,
      'więc przejął ją nasz zespół techniczny. Nie musisz nic robić — dokończymy przenosiny',
      'i poinformujemy Cię o zakończeniu. Twoja obecna strona cały czas działa u starego dostawcy.',
      '',
      `Numer zlecenia: ${req.id.slice(0, 8)}`,
      '',
      '— Verris Hosting',
    ].join('\n');
  }

  private buildSuccessMail(req: {
    id: string;
    bytesTransferred: bigint;
    filesTransferred: number;
    databasesMigrated: number;
    mailboxesMigrated: number;
    targetDomain: string | null;
    subscription: { account: { domain: string } | null };
  }, firstName: string | null): string {
    return [
      `${firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,'}`,
      '',
      `migracja Twojej strony ${req.targetDomain ?? req.subscription.account?.domain ?? ''} została zakończona pomyślnie.`,
      '',
      `Pliki: ${req.filesTransferred} (${formatBytes(req.bytesTransferred)})`,
      `Bazy danych: ${req.databasesMigrated}`,
      `Skrzynki IMAP: ${req.mailboxesMigrated}`,
      '',
      'Ostatni krok: przełączenie DNS. Wejdź w panelu klienta w zakładkę Migracje —',
      'znajdziesz tam gotowe rekordy do ustawienia (albo automatyczne potwierdzenie,',
      'jeśli domena jest już delegowana na nasze serwery nazw). Przed przełączeniem',
      'możesz jednym kliknięciem dograć różnice (delta-sync plików i poczty).',
      '',
      'Sprawdź proszę poprawność działania strony i zgłoś nam wszelkie nieprawidłowości w ciągu 7 dni.',
      '',
      '— Verris Hosting',
    ].join('\n');
  }

  private buildFailureMail(
    req: { id: string; lastError: string | null; targetDomain: string | null },
    firstName: string | null,
  ): string {
    return [
      `${firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,'}`,
      '',
      `niestety nasza migracja ${req.targetDomain ?? ''} została zatrzymana z powodu błędu po stronie źródła:`,
      '',
      req.lastError ?? 'Operator wsparcia opisze szczegóły w tickecie.',
      '',
      'Wsparcie odezwie się do Ciebie w tickecie najpóźniej w ciągu kilku godzin. Twoja stara strona nadal działa bez przerwy.',
      '',
      '— Verris Hosting',
    ].join('\n');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processQueuedMigrations(): Promise<void> {
    const queue = await this.prisma.subscriptionEvent.findMany({
      where: {
        type: { in: ['MIGRATION_EXTERNAL_REQUESTED', 'MIGRATION_INTERNAL_REQUESTED'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: {
        subscription: {
          include: { account: true, user: { select: { id: true, email: true } } },
        },
      },
    });

    for (const req of queue) {
      const alreadyProcessed = await this.prisma.subscriptionEvent.findFirst({
        where: {
          subscriptionId: req.subscriptionId,
          type: {
            in: [
              'MIGRATION_EXTERNAL_QUEUED',
              'MIGRATION_EXTERNAL_FAILED',
              'MIGRATION_INTERNAL_QUEUED',
              'MIGRATION_INTERNAL_FAILED',
            ],
          },
          details: { path: ['requestId'], equals: req.id },
        },
        select: { id: true },
      });
      if (alreadyProcessed) continue;

      try {
        await this.directAdmin.createHostingSiteBackupNow(req.subscriptionId, req.subscription.userId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.prisma.subscriptionEvent.create({
          data: {
            subscriptionId: req.subscriptionId,
            type: req.type === 'MIGRATION_EXTERNAL_REQUESTED' ? 'MIGRATION_EXTERNAL_FAILED' : 'MIGRATION_INTERNAL_FAILED',
            details: {
              requestId: req.id,
              stage: 'pre_backup',
              error: msg,
              createdAt: new Date().toISOString(),
            },
          },
        });
        this.logger.warn(`migration pre_backup failed request=${req.id}: ${msg}`);
        continue;
      }

      const ticket = await this.prisma.ticket.create({
        data: {
          userId: req.subscription.userId,
          subject:
            req.type === 'MIGRATION_EXTERNAL_REQUESTED'
              ? `Migracja zewnętrzna #${req.subscriptionId}`
              : `Migracja wewnętrzna #${req.subscriptionId}`,
          message: this.buildTicketMessage(req.type, req.details, req.subscription.account?.domain ?? null),
          department: 'TECHNICAL',
          priority: 'HIGH',
        },
      });

      const queuedType =
        req.type === 'MIGRATION_EXTERNAL_REQUESTED'
          ? 'MIGRATION_EXTERNAL_QUEUED'
          : 'MIGRATION_INTERNAL_QUEUED';
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: req.subscriptionId,
          type: queuedType,
          details: {
            requestId: req.id,
            ticketId: ticket.id,
            backupTriggered: true,
            queuedAt: new Date().toISOString(),
          },
        },
      });

      await this.audit.record({
        action: queuedType,
        userId: req.subscription.userId,
        actorUserId: null,
        details: {
          subscriptionId: req.subscriptionId,
          requestId: req.id,
          ticketId: ticket.id,
        },
      });
    }
  }

  private buildTicketMessage(
    type: string,
    rawDetails: unknown,
    domain: string | null,
  ): string {
    const details = rawDetails && typeof rawDetails === 'object' ? (rawDetails as Record<string, unknown>) : {};
    if (type === 'MIGRATION_EXTERNAL_REQUESTED') {
      return [
        'Automatyczne zgłoszenie migracji zewnętrznej (G-6).',
        `Domena docelowa: ${domain ?? '—'}`,
        `Typ źródła: ${String(details.sourceType ?? '—')}`,
        `Host źródła: ${String(details.sourceHost ?? '—')}:${String(details.sourcePort ?? '—')}`,
        `Użytkownik źródła: ${String(details.sourceUsername ?? '—')}`,
        `Ścieżka: ${String(details.sourcePath ?? '—')}`,
        `Notatki klienta: ${String(details.notes ?? '—')}`,
        '',
        'Uwaga: sekret źródłowy zapisany szyfrowany w details zdarzenia migracyjnego.',
      ].join('\n');
    }
    return [
      'Automatyczne zgłoszenie migracji wewnętrznej (G-7).',
      `Domena: ${domain ?? '—'}`,
      `Docelowy serverId: ${String(details.targetServerId ?? '—')}`,
      `Notatki: ${String(details.notes ?? '—')}`,
      '',
      'Worker wykonał backup przygotowawczy w DirectAdmin.',
    ].join('\n');
  }
}


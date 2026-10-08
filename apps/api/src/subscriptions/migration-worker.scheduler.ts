import { TicketsService } from '../tickets/tickets.service.js';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MigrationStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { escapeMarkdown, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';
import { opiekunSlownie, terminSlownie } from '../tickets/opieka-zgloszen.service.js';

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
    private readonly tickets: TicketsService,
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
    // Kopia i bazy dla 10 zleceń potrafią trwać dłużej niż minuta — bez tego kolejny przebieg
    // brał te same zlecenia QUEUED (druga kopia, drugie bazy → fałszywa eskalacja).
    if (this.zajety) return;
    this.zajety = true;
    try {
      await this.przetworzKolejke();
    } finally {
      this.zajety = false;
    }
  }

  private zajety = false;

  private async przetworzKolejke(): Promise<void> {
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
          `Kopia bezpieczeństwa konta docelowego przed migracją nie powiodła się: ${msg}`,
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
          `Nie udało się utworzyć baz docelowych na koncie klienta: ${msg}`,
        );
        continue;
      }

      await this.prisma.migrationRequest.update({
        where: { id: req.id },
        data: {
          status: MigrationStatus.RUNNING,
          currentStep: 'worker-queue',
          startedAt: new Date(),
          preBackupAt: new Date(),
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
        workerJobs: { where: { kind: 'HTTP_POST_CHECK' }, select: { payload: true } },
      },
    });
    for (const row of finished) {
      const ok = row.status === MigrationStatus.COMPLETED;
      // Test strony bez przeniesionej bazy wrócił z błędem (zakres „Pliki”) — mail mówi, czego brakuje.
      const stronaBezBazy = row.workerJobs.some(
        (j) => !!j.payload && typeof j.payload === 'object' && (j.payload as Record<string, unknown>).uwaga === 'strona-bez-bazy',
      );
      try {
        await this.mailer.send({
          to: row.subscription.user.email,
          subject: ok
            ? `Migracja zakończona sukcesem — ${row.subscription.account?.domain ?? row.targetDomain ?? '—'}`
            : `Migracja zatrzymana — ${row.targetDomain ?? row.subscription.account?.domain ?? '—'}`,
          ...(ok
            ? this.buildSuccessMail(row.subscription.user.email, row, row.subscription.user.firstName, stronaBezBazy)
            : this.buildFailureMail(row.subscription.user.email, row, row.subscription.user.firstName)),
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
        // Zgłoszenie z eskalacji nie wysyła własnego potwierdzenia — opiekun, termin i link idą w tym mailu.
        const tik = row.ticketId
          ? await this.prisma.ticket.findUnique({
              where: { id: row.ticketId },
              select: { id: true, slaResponseDueAt: true, assignedTo: { select: { firstName: true, lastName: true } } },
            })
          : null;
        const zgloszenie = tik ? { id: tik.id, opiekun: opiekunSlownie(tik.assignedTo), termin: terminSlownie(tik.slaResponseDueAt) } : null;
        await this.mailer.send({
          to: row.subscription.user.email,
          subject: `Migracja ${row.targetDomain ?? row.subscription.account?.domain ?? ''} — przejął ją nasz zespół`,
          ...this.buildAttentionMail(row.subscription.user.email, row, row.subscription.user.firstName, zgloszenie),
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

  /** Maile migracji idą przez wspólny szablon (M-03) — do `mailer.send` rozwijamy `{ text, html }`. */
  private mailMigracji(
    to: string,
    firstName: string | null,
    tresc: { title: string; preheader: string; akapity: string[]; cta?: { label: string; url: string } },
  ) {
    const panelUrl = (process.env.CLIENT_PANEL_URL || 'https://panel.verris.pl').replace(/\/$/, '');
    return renderEmailShell({
      title: tresc.title,
      preheader: tresc.preheader,
      bodyMarkdown: [firstName ? `Dzień dobry **${escapeMarkdown(firstName)}**,` : 'Dzień dobry,', ...tresc.akapity].join('\n\n'),
      cta: tresc.cta ?? { label: 'Otwórz Migracje', url: `${panelUrl}/dashboard/migrations` },
      recipientEmail: to,
      panelUrl,
    });
  }

  private buildAttentionMail(
    to: string,
    req: { id: string; targetDomain: string | null; subscription: { account: { domain: string } | null } },
    firstName: string | null,
    zgloszenie: { id: string; opiekun: string; termin: string } | null = null,
  ) {
    const domena = escapeMarkdown(req.targetDomain ?? req.subscription.account?.domain ?? '');
    const panelUrl = (process.env.CLIENT_PANEL_URL || 'https://panel.verris.pl').replace(/\/$/, '');
    return this.mailMigracji(to, firstName, {
      title: 'Migrację przejął nasz zespół',
      preheader: 'Nie musisz nic robić — dokończymy przenosiny i damy znać.',
      akapity: [
        `Automatyczna migracja **${domena}** napotkała przeszkodę, więc przejął ją nasz zespół techniczny. Nie musisz nic robić — dokończymy przenosiny i poinformujemy Cię o zakończeniu. Twoja obecna strona cały czas działa u starego dostawcy.`,
        ...(zgloszenie
          ? [
              `Prowadzimy to w zgłoszeniu **#${zgloszenie.id.slice(0, 8)}** — zajmuje się nim **${escapeMarkdown(zgloszenie.opiekun)}**, odezwiemy się ${zgloszenie.termin}. W zgłoszeniu możesz też dopisać pytania.`,
            ]
          : []),
        `Numer zlecenia: **${req.id.slice(0, 8)}**`,
      ],
      ...(zgloszenie ? { cta: { label: 'Otwórz zgłoszenie', url: `${panelUrl}/dashboard/support/${zgloszenie.id}` } } : {}),
    });
  }

  private buildSuccessMail(to: string, req: {
    id: string;
    bytesTransferred: bigint;
    filesTransferred: number;
    databasesMigrated: number;
    mailboxesMigrated: number;
    targetDomain: string | null;
    subscription: { account: { domain: string } | null };
  }, firstName: string | null, stronaBezBazy = false) {
    const domena = escapeMarkdown(req.targetDomain ?? req.subscription.account?.domain ?? '');
    return this.mailMigracji(to, firstName, {
      title: 'Migracja zakończona',
      preheader: 'Został ostatni krok: przełączenie DNS.',
      akapity: [
        `Migracja Twojej strony **${domena}** została zakończona pomyślnie.`,
        ...(stronaBezBazy
          ? [
              'Przenieśliśmy same pliki, a strona na nowym serwerze odpowiada błędem — najczęściej dlatego, że korzysta z bazy danych, która została u poprzedniego dostawcy. Przenieś ją w zakładce Migracje → **Baza danych** (albo uruchom migrację **Cała strona**).',
            ]
          : []),
        [
          `- **Pliki:** ${req.filesTransferred} (${formatBytes(req.bytesTransferred)})`,
          `- **Bazy danych:** ${req.databasesMigrated}`,
          `- **Skrzynki pocztowe:** ${req.mailboxesMigrated}`,
        ].join('\n'),
        '## Ostatni krok: przełączenie DNS',
        'W zakładce Migracje znajdziesz gotowe wpisy DNS do ustawienia u dostawcy domeny (a jeśli domena korzysta już z naszego DNS — automatyczne potwierdzenie). Przed przełączeniem możesz jednym kliknięciem dograć pliki i wiadomości, które pojawiły się po skopiowaniu strony.',
        'Sprawdź proszę poprawność działania strony i zgłoś nam wszelkie nieprawidłowości w ciągu 7 dni.',
      ],
    });
  }

  /** Bez `lastError` — surowy komunikat (np. „rc=23”) nic klientowi nie mówi; szczegóły opisze opiekun w zgłoszeniu. */
  private buildFailureMail(
    to: string,
    req: { id: string; targetDomain: string | null },
    firstName: string | null,
  ) {
    return this.mailMigracji(to, firstName, {
      title: 'Migracja zatrzymana',
      preheader: 'Twoja strona działa dalej u poprzedniego dostawcy. Szczegóły opisze opiekun w zgłoszeniu.',
      akapity: [
        `Przenoszenie strony **${escapeMarkdown(req.targetDomain ?? '')}** zatrzymało się. Twoja strona działa dalej u poprzedniego dostawcy.`,
        'Szczegóły i dalsze kroki opisze opiekun w zgłoszeniu w panelu.',
      ],
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processQueuedMigrations(): Promise<void> {
    // Kopia DA dla kilku wniosków potrafi przekroczyć minutę — nakładający się przebieg robił
    // drugą kopię i drugie zgłoszenie dla tego samego wniosku.
    if (this.zajetyWnioski) return;
    this.zajetyWnioski = true;
    try {
      await this.przetworzWnioski();
    } finally {
      this.zajetyWnioski = false;
    }
  }

  private zajetyWnioski = false;

  private async przetworzWnioski(): Promise<void> {
    // Tylko NIEOBSŁUŻONE wnioski. Wcześniej brane było 20 najstarszych w ogóle, a obsłużone
    // pomijane w pętli — po 20 wnioskach w historii nowe nie były już nigdy przetwarzane.
    const nieobsluzone = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r.id FROM "SubscriptionEvent" r
      WHERE r.type IN ('MIGRATION_EXTERNAL_REQUESTED', 'MIGRATION_INTERNAL_REQUESTED')
        AND NOT EXISTS (
          SELECT 1 FROM "SubscriptionEvent" p
          WHERE p."subscriptionId" = r."subscriptionId"
            AND p.type IN ('MIGRATION_EXTERNAL_QUEUED', 'MIGRATION_EXTERNAL_FAILED', 'MIGRATION_INTERNAL_QUEUED', 'MIGRATION_INTERNAL_FAILED')
            AND p.details->>'requestId' = r.id
        )
      ORDER BY r."createdAt" ASC
      LIMIT 20`;
    if (nieobsluzone.length === 0) return;
    const queue = await this.prisma.subscriptionEvent.findMany({
      where: { id: { in: nieobsluzone.map((r) => r.id) } },
      orderBy: { createdAt: 'asc' },
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

      const ticket = await this.tickets.create(req.subscription.userId, {
        subject:
          req.type === 'MIGRATION_EXTERNAL_REQUESTED'
            ? `Przeniesienie strony ${req.subscription.account?.domain ?? ''} do Verris`
            : `Przeniesienie konta ${req.subscription.account?.domain ?? ''} na inny serwer`,
        message: this.buildTicketMessage(req.type, req.details, req.subscription.account?.domain ?? null),
        department: 'TECHNICAL',
        priority: 'HIGH',
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

  /** Treść widzi klient jako swoją wiadomość — bez kodów zadań, id węzła i uwag o sekretach. */
  private buildTicketMessage(
    type: string,
    rawDetails: unknown,
    domain: string | null,
  ): string {
    const details = rawDetails && typeof rawDetails === 'object' ? (rawDetails as Record<string, unknown>) : {};
    const notatki = details.notes ? String(details.notes) : '—';
    if (type === 'MIGRATION_EXTERNAL_REQUESTED') {
      return [
        'Zgłoszenie utworzone automatycznie z formularza przeniesienia strony.',
        `Domena: ${domain ?? '—'}`,
        `Źródło: ${String(details.sourceType ?? '—')} ${String(details.sourceHost ?? '—')}:${String(details.sourcePort ?? '—')}`,
        `Użytkownik: ${String(details.sourceUsername ?? '—')}`,
        `Ścieżka: ${String(details.sourcePath ?? '—')}`,
        `Twoje uwagi: ${notatki}`,
      ].join('\n');
    }
    return [
      'Zgłoszenie utworzone automatycznie: przeniesienie konta na inny serwer.',
      `Domena: ${domain ?? '—'}`,
      `Twoje uwagi: ${notatki}`,
      '',
      'Przed przeniesieniem wykonaliśmy kopię zapasową konta.',
    ].join('\n');
  }

}


import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class MigrationWorkerScheduler {
  private readonly logger = new Logger(MigrationWorkerScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly audit: AuditService,
  ) {}

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


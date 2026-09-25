import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DataExportService } from './data-export.service';
import { RodoActions } from '../common/audit/audit.actions';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sprint 1 / L-10 — daily retention sweeper.
 *
 * Runs at 04:00 every night. Independently from the account-deletion cron
 * because the targets are different (this one purges low-PII rows in bulk).
 *
 * Policies enforced:
 *  - `LoginAttempt` rows older than 180 days → DELETE.
 *  - `AuditLog` rows older than 24 months → anonymize `ipAddress`/`userAgent`.
 *    Action and target IDs are kept (needed for accounting/UODO audit).
 *  - `DataExportRequest.READY` past `expiresAt` → flip to EXPIRED, delete file.
 *  - `StripeWebhookEvent` (deduplikacja webhooków) starsze niż 90 dni → DELETE.
 *  - `AiInteractionLog` (pytania/odpowiedzi asystenta AI, koszty) starsze niż 12 miesięcy → DELETE (RCPD A13).
 * Konto DA usuwa ścieżka art. 17 (account-deletion.scheduler), nie ten sweeper.
 */
@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);

  private readonly loginAttemptRetentionDays = 180;
  private readonly auditLogIpRetentionDays = 24 * 30; // ~24 months
  private readonly aiLogRetentionDays = 365;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dataExport: DataExportService,
  ) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    const now = new Date();

    const [loginPurged, auditAnonymized, exportsExpired, webhookEventsPurged, aiLogsPurged] =
      await Promise.all([
        this.purgeLoginAttempts(now),
        this.anonymizeOldAuditLogIps(now),
        this.dataExport.expireDueExports(),
        this.purgeStripeWebhookEvents(now),
        this.purgeAiLogs(now),
      ]);

    if (loginPurged + auditAnonymized + exportsExpired + webhookEventsPurged + aiLogsPurged > 0) {
      await this.audit.record({
        action: RodoActions.RETENTION_PURGE,
        details: {
          runAt: now.toISOString(),
          loginAttemptsPurged: loginPurged,
          auditLogIpsAnonymized: auditAnonymized,
          exportsExpired,
          stripeWebhookEventsPurged: webhookEventsPurged,
          aiLogsPurged,
        },
      });
      this.logger.log(
        `Retention sweep: login=${loginPurged} auditIp=${auditAnonymized} exports=${exportsExpired} stripeEvents=${webhookEventsPurged} ai=${aiLogsPurged}`,
      );
    } else {
      this.logger.debug('Retention sweep: nothing to do');
    }
  }

  /**
   * Audit F-16: webhook dedupe rows only need to outlive Stripe's retry
   * window (72 h) by a wide margin — 90 days keeps the table tiny.
   */
  private async purgeStripeWebhookEvents(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - 90 * DAY_MS);
    const result = await this.prisma.stripeWebhookEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  /** Dziennik asystenta AI trzyma treść pytań i odpowiedzi — rok wystarcza na limity, koszty i reklamacje. */
  private async purgeAiLogs(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.aiLogRetentionDays * DAY_MS);
    const result = await this.prisma.aiInteractionLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  // ---------------------------------------------------------------------------
  // Sub-policies
  // ---------------------------------------------------------------------------

  private async purgeLoginAttempts(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.loginAttemptRetentionDays * DAY_MS);
    const result = await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  private async anonymizeOldAuditLogIps(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - this.auditLogIpRetentionDays * DAY_MS);
    // Only touch rows that still have IP/UA — saves write amplification.
    const result = await this.prisma.auditLog.updateMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
      },
      data: { ipAddress: null, userAgent: null },
    });
    return result.count;
  }
}

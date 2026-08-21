import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { accountQuotaAlertTemplate } from '../mail/templates/hosting-notifications';

const THRESHOLD_PCT = 85; // alert gdy dysk LUB transfer >= 85%
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // maks. 1 alert / 3 dni / konto
const MAX_PER_RUN = 500; // bezpiecznik na liczbę kont sprawdzanych w jednym przebiegu

/**
 * PANEL-14 — proaktywne alerty o zbliżaniu się do limitów konta hostingowego.
 * Raz dziennie liczy wykorzystanie dysku/transferu (realne dane z DA) i wysyła
 * klientowi e-mail, gdy przekroczy próg. De-dup przez AuditLog (bez migracji).
 */
@Injectable()
export class QuotaAlertScheduler {
  private readonly logger = new Logger(QuotaAlertScheduler.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  @Cron('0 7 * * *', { name: 'hosting-quota-alerts' })
  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const subs = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          plan: { productKind: { not: 'EMAIL' } },
          account: { isNot: null },
        },
        select: {
          id: true,
          userId: true,
          account: { select: { domain: true } },
          user: { select: { email: true, firstName: true } },
        },
        take: MAX_PER_RUN,
      });

      const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const recent = await this.prisma.auditLog.findMany({
        where: { action: 'HOSTING_QUOTA_ALERT', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { details: true, createdAt: true },
      });
      const lastFor = (subId: string) =>
        recent.find((r) => (r.details as { subscriptionId?: string } | null)?.subscriptionId === subId)?.createdAt ?? null;

      const pct = (used: number, limit: number | null) =>
        limit && limit > 0 ? Math.round((used / limit) * 100) : null;

      let sent = 0;
      for (const s of subs) {
        const last = lastFor(s.id);
        if (last && Date.now() - last.getTime() < COOLDOWN_MS) continue;
        if (!s.user?.email) continue;
        let stats;
        try {
          stats = await this.da.getHostingAccountStats(s.id, s.userId);
        } catch {
          continue;
        }
        if (stats.fetchError) continue;
        const diskPct = pct(stats.disk.usedMb, stats.disk.limitMb);
        const bwPct = pct(stats.bandwidth.usedMb, stats.bandwidth.limitMb);
        const top = Math.max(diskPct ?? 0, bwPct ?? 0);
        if (top < THRESHOLD_PCT) continue;

        await this.audit.record({
          action: 'HOSTING_QUOTA_ALERT',
          userId: s.userId,
          details: { subscriptionId: s.id, diskPct, bwPct },
        });
        await this.mailer
          .send({
            ...accountQuotaAlertTemplate({
              to: s.user.email,
              firstName: s.user.firstName ?? null,
              domain: s.account?.domain ?? 'Twoje konto',
              diskPct,
              bandwidthPct: bwPct,
              panelUrl: this.panelUrl(),
            }),
            userId: s.userId,
            category: 'TRANSACTIONAL',
            fromRole: 'SUPPORT',
          })
          .catch((err) => this.logger.warn(`quota alert mail failed sub=${s.id}: ${(err as Error).message}`));
        sent += 1;
      }
      if (sent > 0) this.logger.log(`Wysłano ${sent} alert(ów) o limitach kont.`);
    } catch (err) {
      this.logger.error(`quota-alert run failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

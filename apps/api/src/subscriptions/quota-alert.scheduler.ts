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
const PAGE = 200; // konta czytane porcjami — wcześniej `take: 500` bez kolejności pomijało resztę na stałe
// K-08: CPU/RAM — próbka „przy limicie” to >= 90% efektywnego limitu (plan + autoskalowanie);
// alert, gdy takich próbek jest >= 10% z ostatniej doby i próbek jest dość, żeby to coś znaczyło.
const HOT_OF_LIMIT = 0.9;
const HOT_SHARE_PCT = 10;
const MIN_SAMPLES = 60;

/** Odsetek próbek przy limicie albo null, gdy poniżej progu lub za mało danych. */
export function udzialPrzyLimicie(wszystkie: number, przyLimicie: number): number | null {
  if (wszystkie < MIN_SAMPLES) return null;
  const udzial = (przyLimicie / wszystkie) * 100;
  return udzial >= HOT_SHARE_PCT ? Math.round(udzial) : null;
}

/**
 * PANEL-14 — proaktywne alerty o zbliżaniu się do limitów konta hostingowego.
 * K-08 — także CPU i RAM: z próbek LVE (UsageMetric) z ostatniej doby.
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

  /** K-08: udział próbek LVE z ostatniej doby, w których CPU / RAM stał przy efektywnym limicie. */
  private async przyLimicieCpuRam(s: {
    id: string;
    account: { scaledCpu: number; scaledRamMb: number } | null;
    plan: { cpuLimit: number; ramLimitMb: number };
  }): Promise<{ cpuHotPct: number | null; ramHotPct: number | null }> {
    const cpu = s.plan.cpuLimit + (s.account?.scaledCpu ?? 0);
    const ram = s.plan.ramLimitMb + (s.account?.scaledRamMb ?? 0);
    const where = { subscriptionId: s.id, bucketStart: { gte: new Date(Date.now() - 24 * 3600 * 1000) } };
    const [wszystkie, goraceCpu, goraceRam] = await Promise.all([
      this.prisma.usageMetric.count({ where }),
      cpu > 0 ? this.prisma.usageMetric.count({ where: { ...where, cpuUsageAvg: { gte: cpu * HOT_OF_LIMIT } } }) : 0,
      ram > 0 ? this.prisma.usageMetric.count({ where: { ...where, memUsageAvgMb: { gte: ram * HOT_OF_LIMIT } } }) : 0,
    ]);
    return {
      cpuHotPct: udzialPrzyLimicie(wszystkie, goraceCpu),
      ramHotPct: udzialPrzyLimicie(wszystkie, goraceRam),
    };
  }

  @Cron('0 7 * * *', { name: 'hosting-quota-alerts' })
  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const subs: Array<{
        id: string;
        userId: string;
        account: { domain: string; scaledCpu: number; scaledRamMb: number } | null;
        plan: { cpuLimit: number; ramLimitMb: number };
        user: { email: string; firstName: string | null } | null;
      }> = [];
      for (let cursor: string | undefined; ; ) {
        const page = await this.prisma.subscription.findMany({
          where: {
            status: SubscriptionStatus.ACTIVE,
            plan: { productKind: { not: 'EMAIL' } },
            account: { isNot: null },
          },
          select: {
            id: true,
            userId: true,
            account: { select: { domain: true, scaledCpu: true, scaledRamMb: true } },
            plan: { select: { cpuLimit: true, ramLimitMb: true } },
            user: { select: { email: true, firstName: true } },
          },
          orderBy: { id: 'asc' },
          take: PAGE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        subs.push(...page);
        if (page.length < PAGE) break;
        cursor = page[page.length - 1].id;
      }

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
        const { cpuHotPct, ramHotPct } = await this.przyLimicieCpuRam(s);
        const top = Math.max(diskPct ?? 0, bwPct ?? 0);
        if (top < THRESHOLD_PCT && cpuHotPct == null && ramHotPct == null) continue;

        await this.audit.record({
          action: 'HOSTING_QUOTA_ALERT',
          userId: s.userId,
          details: { subscriptionId: s.id, diskPct, bwPct, cpuHotPct, ramHotPct },
        });
        await this.mailer
          .send({
            ...accountQuotaAlertTemplate({
              to: s.user.email,
              firstName: s.user.firstName ?? null,
              domain: s.account?.domain ?? 'Twoje konto',
              diskPct: diskPct != null && diskPct >= THRESHOLD_PCT ? diskPct : null,
              bandwidthPct: bwPct != null && bwPct >= THRESHOLD_PCT ? bwPct : null,
              cpuHotPct,
              ramHotPct,
              panelUrl: this.panelUrl(),
              ctaUrl: `${this.panelUrl()}/dashboard/services/${s.id}?tab=usage`,
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

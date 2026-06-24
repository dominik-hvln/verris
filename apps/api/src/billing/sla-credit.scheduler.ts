import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  IncidentSeverity,
  IncidentStatus,
  Prisma,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { slaCreditTemplate } from '../mail/templates/billing-lifecycle-notifications';
import { NotificationsService } from '../notifications/notifications.service';

/** Minut w "miesiącu rozliczeniowym" — przyjmujemy 30 dni (standard SLA). */
const MINUTES_IN_MONTH = 30 * 24 * 60;

/**
 * #11 — automatyczne kredyty SLA za przestój infrastruktury.
 *
 * Źródło prawdy: rozwiązane incydenty `ProbeIncident` (status-probe floty) o
 * istotności MAJOR. Dla każdego konta hostingowego na dotkniętym węźle liczymy
 * rekompensatę proporcjonalną do czasu przestoju (z mnożnikiem i limitem z
 * ustawień admina) i uznajemy portfel. Idempotencja: `ProbeIncident.slaCreditedAt`
 * + unikat `SlaCredit(incidentId, subscriptionId)` + idempotencyKey portfela.
 *
 * Domyślnie WYŁĄCZONE (admin włącza po przeglądzie polityki) — nic nie jest
 * kredytowane, dopóki `sla.creditsEnabled = 1`.
 */
@Injectable()
export class SlaCreditScheduler {
  private readonly logger = new Logger(SlaCreditScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
    private readonly mailer: MailerService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'billing:sla-credits' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`SLA credit run failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  async run(): Promise<void> {
    const policy = await this.platformSettings.getSlaCreditPolicy();
    if (!policy.enabled) return;

    const incidents = await this.prisma.probeIncident.findMany({
      where: {
        status: IncidentStatus.RESOLVED,
        slaCreditedAt: null,
        severity: IncidentSeverity.MAJOR,
        resolvedAt: { not: null },
      },
      include: { probe: { select: { serverId: true } } },
      take: 50,
    });
    if (incidents.length === 0) return;

    const panelUrl = (
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl'
    ).replace(/\/$/, '');

    let creditedTotal = 0;
    for (const incident of incidents) {
      const startedAt = incident.startedAt.getTime();
      const resolvedAt = (incident.resolvedAt ?? incident.startedAt).getTime();
      const downtimeS = Math.max(0, Math.round((resolvedAt - startedAt) / 1000));
      const downtimeMin = downtimeS / 60;

      // Krótki przestój (≤ grace) — nic nie kredytujemy, ale oznaczamy jako
      // przetworzony, żeby nie skanować go w kółko.
      if (downtimeMin <= policy.graceMinutes) {
        await this.markProcessed(incident.id);
        continue;
      }

      const subs = await this.prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          plan: { productKind: 'HOSTING' },
          account: { serverId: incident.probe.serverId },
        },
        include: {
          plan: { select: { name: true } },
          account: { select: { domain: true } },
          user: { select: { email: true, firstName: true, anonymizedAt: true } },
        },
      });

      const creditableMin = downtimeMin - policy.graceMinutes;
      for (const sub of subs) {
        if (!sub.user || sub.user.anonymizedAt) continue;
        const monthlyEq =
          sub.interval === 'YEAR'
            ? new Prisma.Decimal(sub.priceAmount).div(12)
            : new Prisma.Decimal(sub.priceAmount);

        // amount = monthlyEq × (creditableMin × multiplier) / minutesInMonth, ≤ cap
        const raw = monthlyEq
          .mul(new Prisma.Decimal(creditableMin * policy.multiplier))
          .div(MINUTES_IN_MONTH);
        const cap = monthlyEq.mul(new Prisma.Decimal(policy.capPercent)).div(100);
        const amount = (raw.greaterThan(cap) ? cap : raw).toDecimalPlaces(
          2,
          Prisma.Decimal.ROUND_HALF_UP,
        );
        if (amount.lessThanOrEqualTo(0)) continue;

        try {
          const tx = await this.walletLedger.credit({
            userId: sub.userId,
            type: WalletTxType.ADJUSTMENT,
            amount,
            description: `Kredyt SLA za przestój (${sub.account?.domain ?? sub.plan?.name ?? 'usługa'})`,
            idempotencyKey: `sla-${incident.id}-${sub.id}`,
            subscriptionId: sub.id,
          });

          await this.prisma.slaCredit
            .create({
              data: {
                incidentId: incident.id,
                subscriptionId: sub.id,
                userId: sub.userId,
                downtimeS,
                amount,
                currency: sub.currency ?? 'PLN',
              },
            })
            .catch((e) => {
              // Unikat (już zapisany) — kredyt portfela i tak był idempotentny.
              if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
                throw e;
              }
            });

          await this.audit.record({
            action: 'SLA_CREDIT_GRANTED',
            userId: sub.userId,
            details: {
              incidentId: incident.id,
              subscriptionId: sub.id,
              amount: amount.toFixed(2),
              downtimeS,
            },
          });

          // NTF-2 — wpis do dzwonka in-app obok e-maila (best-effort).
          await this.notifications.create({
            userId: sub.userId,
            category: 'SLA',
            severity: 'info',
            title: 'Przyznano kredyt SLA',
            body: `Za przestój infrastruktury doliczyliśmy ${amount.toFixed(2)} ${(sub.currency ?? 'PLN').toUpperCase()} do Twojego portfela.`,
            link: '/dashboard/billing',
            subscriptionId: sub.id,
          });

          const serviceName = sub.account?.domain
            ? `${sub.plan?.name ?? 'Hosting'} (${sub.account.domain})`
            : (sub.plan?.name ?? 'Hosting Verris');
          const message = slaCreditTemplate({
            to: sub.user.email,
            firstName: sub.user.firstName,
            serviceName,
            amount: amount.toFixed(2),
            currency: (sub.currency ?? 'PLN').toUpperCase() as 'PLN' | 'EUR' | 'USD',
            downtimeMinutes: creditableMin,
            incidentDate: incident.startedAt,
            newWalletBalance: new Prisma.Decimal(tx.balanceAfter).toFixed(2),
            panelUrl,
          });
          void this.mailer
            .send({ ...message, userId: sub.userId, category: 'TRANSACTIONAL', fromRole: 'BILLING' })
            .catch((err) => {
              this.logger.warn(
                `sla-credit mail failed sub=${sub.id}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            });
          creditedTotal += 1;
        } catch (err) {
          this.logger.error(
            `SLA credit failed incident=${incident.id} sub=${sub.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      await this.markProcessed(incident.id);
    }

    if (creditedTotal > 0) {
      this.logger.log(`SLA credits: przyznano ${creditedTotal} kredytów z ${incidents.length} incydentów.`);
    }
  }

  private async markProcessed(incidentId: string): Promise<void> {
    await this.prisma.probeIncident.update({
      where: { id: incidentId },
      data: { slaCreditedAt: new Date() },
    });
  }
}

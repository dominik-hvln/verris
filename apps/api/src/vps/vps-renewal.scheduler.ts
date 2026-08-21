import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, VpsStatus, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { HetznerClient } from './hetzner.client';
import { vpsSuspendedTemplate, vpsTerminatedTemplate } from '../mail/templates/vps-notifications';

const GRACE_DAYS = 7;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Monthly prepaid VPS billing from the wallet. Daily:
 *  - period ended → debit next month; success extends +30d.
 *  - insufficient funds → power off + SUSPEND (once), e-mail the customer.
 *  - unpaid > GRACE_DAYS → delete the Hetzner server + mark DELETED, e-mail.
 */
@Injectable()
export class VpsRenewalScheduler {
  private readonly logger = new Logger(VpsRenewalScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletLedgerService,
    private readonly hetzner: HetznerClient,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async tick(): Promise<void> {
    const now = Date.now();
    const due = await this.prisma.vpsInstance.findMany({
      where: {
        status: { in: [VpsStatus.RUNNING, VpsStatus.STOPPED] },
        currentPeriodEnd: { lte: new Date(now) },
      },
      include: { user: { select: { email: true, firstName: true } }, plan: { select: { name: true } } },
      take: 200,
    });

    for (const v of due) {
      const overdueMs = now - (v.currentPeriodEnd?.getTime() ?? now);
      try {
        await this.wallet.debit({
          userId: v.userId,
          type: WalletTxType.CHARGE_USAGE,
          amount: new Prisma.Decimal(v.priceMonthly),
          description: `VPS ${v.name} — odnowienie miesięczne`,
          idempotencyKey: `vps-${v.id}-renew-${v.currentPeriodEnd?.toISOString() ?? now}`,
        });
        // Paid → extend period; auto-resume if it was suspended.
        if (v.status === VpsStatus.STOPPED && v.hetznerServerId) {
          await this.hetzner.powerOn(v.hetznerServerId).catch(() => undefined);
        }
        await this.prisma.vpsInstance.update({
          where: { id: v.id },
          data: {
            currentPeriodEnd: new Date((v.currentPeriodEnd?.getTime() ?? now) + PERIOD_MS),
            status: VpsStatus.RUNNING,
          },
        });
        await this.audit.record({ action: 'VPS_RENEWED', userId: v.userId, details: { instanceId: v.id } });
      } catch {
        // Insufficient funds (or transient). Apply grace policy.
        if (overdueMs > GRACE_DAYS * 24 * 60 * 60 * 1000) {
          if (v.hetznerServerId) {
            await this.hetzner.deleteServer(v.hetznerServerId).catch(() => undefined);
          }
          await this.prisma.vpsInstance.update({
            where: { id: v.id },
            data: { status: VpsStatus.DELETED, deletedAt: new Date() },
          });
          await this.audit.record({
            action: 'VPS_TERMINATED_NONPAYMENT',
            userId: v.userId,
            details: { instanceId: v.id },
          });
          await this.mailer
            .send({
              ...vpsTerminatedTemplate({ to: v.user.email, firstName: v.user.firstName, name: v.name, panelUrl: this.panelUrl() }),
              userId: v.userId,
              category: 'TRANSACTIONAL',
            })
            .catch(() => undefined);
        } else if (v.status === VpsStatus.RUNNING) {
          if (v.hetznerServerId) await this.hetzner.powerOff(v.hetznerServerId).catch(() => undefined);
          await this.prisma.vpsInstance.update({ where: { id: v.id }, data: { status: VpsStatus.STOPPED } });
          await this.audit.record({
            action: 'VPS_SUSPENDED_NONPAYMENT',
            userId: v.userId,
            details: { instanceId: v.id },
          });
          await this.mailer
            .send({
              ...vpsSuspendedTemplate({ to: v.user.email, firstName: v.user.firstName, name: v.name, panelUrl: this.panelUrl() }),
              userId: v.userId,
              category: 'TRANSACTIONAL',
            })
            .catch(() => undefined);
        }
      }
    }
    if (due.length) this.logger.log(`VPS renewals processed: ${due.length}`);
  }
}

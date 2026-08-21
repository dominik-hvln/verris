import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { SubscriptionsService } from './subscriptions.service';
import {
  trialEndingSoonTemplate,
  trialExpiredTemplate,
} from '../mail/templates/billing-lifecycle-notifications';

const REMINDER_WINDOW_DAYS = 3;

/**
 * O-1 — drives the free-trial lifecycle once per hour:
 *   1. Reminder: trials ending within REMINDER_WINDOW_DAYS that haven't been
 *      reminded yet → one "ending soon" e-mail, stamps `trialReminderSentAt`.
 *   2. Expiry: trials past `trialEndsAt` still flagged `isTrial` → suspend the
 *      DA account + move to EXPIRED (via SubscriptionsService.expireTrial) and
 *      e-mail the customer.
 *
 * Hourly (not daily) so expiry is reasonably punctual without being chatty; the
 * reminder is de-duplicated by `trialReminderSentAt`.
 */
@Injectable()
export class TrialExpiryScheduler {
  private readonly logger = new Logger(TrialExpiryScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly subscriptions: SubscriptionsService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(
      /\/$/,
      '',
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(): Promise<void> {
    await this.sendReminders().catch((err) =>
      this.logger.error(`trial reminders failed: ${(err as Error).message}`),
    );
    await this.expireDueTrials().catch((err) =>
      this.logger.error(`trial expiry failed: ${(err as Error).message}`),
    );
  }

  private async sendReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const due = await this.prisma.subscription.findMany({
      where: {
        isTrial: true,
        trialReminderSentAt: null,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING] },
        trialEndsAt: { gt: now, lte: windowEnd },
      },
      include: { plan: true, user: { select: { email: true, firstName: true } } },
      take: 200,
    });

    for (const sub of due) {
      if (!sub.trialEndsAt) continue;
      const daysLeft = Math.max(
        1,
        Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      );
      try {
        await this.mailer.send({
          ...trialEndingSoonTemplate({
            to: sub.user.email,
            firstName: sub.user.firstName,
            planName: sub.plan.name,
            trialEndsAt: sub.trialEndsAt,
            daysLeft,
            panelUrl: this.panelUrl(),
          }),
          userId: sub.userId,
          category: 'TRANSACTIONAL',
        });
      } catch (err) {
        this.logger.warn(`trial reminder mail failed (sub=${sub.id}): ${(err as Error).message}`);
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { trialReminderSentAt: new Date() },
      });
    }
    if (due.length) this.logger.log(`Sent ${due.length} trial-ending reminders`);
  }

  private async expireDueTrials(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.subscription.findMany({
      where: {
        isTrial: true,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING] },
        trialEndsAt: { lt: now },
      },
      include: { plan: true, user: { select: { email: true, firstName: true } } },
      take: 200,
    });

    for (const sub of due) {
      try {
        await this.subscriptions.expireTrial(sub.id);
        await this.mailer
          .send({
            ...trialExpiredTemplate({
              to: sub.user.email,
              firstName: sub.user.firstName,
              planName: sub.plan.name,
              panelUrl: this.panelUrl(),
            }),
            userId: sub.userId,
            category: 'TRANSACTIONAL',
          })
          .catch(() => undefined);
      } catch (err) {
        this.logger.error(`expireTrial failed (sub=${sub.id}): ${(err as Error).message}`);
      }
    }
    if (due.length) this.logger.log(`Expired ${due.length} trials`);
  }
}

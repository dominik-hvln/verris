import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { walletAutoTopupFailedTemplate } from '../mail/templates/billing-lifecycle-notifications';

const COOLDOWN_MS = 60 * 60 * 1000;

@Injectable()
export class WalletAutoTopupService {
  private readonly logger = new Logger(WalletAutoTopupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async getForUser(userId: string) {
    const row = await this.prisma.walletAutoTopup.findUnique({ where: { userId } });
    return (
      row ?? {
        enabled: false,
        threshold: new Prisma.Decimal(50),
        topupAmount: new Prisma.Decimal(100),
        currency: 'PLN',
        paymentMethodId: null,
        cooldownUntil: null,
        lastAttemptAt: null,
        lastAttemptOk: null,
        lastAttemptError: null,
      }
    );
  }

  async upsertForUser(
    userId: string,
    dto: {
      enabled: boolean;
      thresholdPln: string;
      topupAmountPln: string;
      localPaymentMethodId: string | null;
    },
  ) {
    const threshold = new Prisma.Decimal(dto.thresholdPln);
    const topupAmount = new Prisma.Decimal(dto.topupAmountPln);

    if (threshold.lessThan(0)) {
      throw new BadRequestException('Próg nie może być ujemny.');
    }
    if (topupAmount.lessThanOrEqualTo(0) || topupAmount.greaterThan(10000)) {
      throw new BadRequestException('Kwota auto-doładowania musi być w (0, 10000].');
    }

    if (dto.enabled && dto.localPaymentMethodId) {
      const pm = await this.prisma.paymentMethod.findFirst({
        where: { id: dto.localPaymentMethodId, userId, provider: 'STRIPE' },
      });
      if (!pm) throw new BadRequestException('Wybrano nieistniejącą metodę płatności.');
    }

    return this.prisma.walletAutoTopup.upsert({
      where: { userId },
      create: {
        userId,
        enabled: dto.enabled,
        threshold,
        topupAmount,
        currency: 'PLN',
        paymentMethodId: dto.localPaymentMethodId ?? undefined,
      },
      update: {
        enabled: dto.enabled,
        threshold,
        topupAmount,
        paymentMethodId: dto.localPaymentMethodId ?? undefined,
      },
    });
  }

  /**
   * Evaluated periodically by `WalletAutoTopupScheduler`.
   */
  async runEligibleChecks(): Promise<void> {
    if (!this.stripe.isConfigured()) {
      return;
    }

    const now = new Date();
    const rules = await this.prisma.walletAutoTopup.findMany({
      where: {
        enabled: true,
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            walletBalance: true,
            walletCurrency: true,
            stripeCustomerId: true,
            defaultPaymentMethodId: true,
          },
        },
      },
    });

    for (const rule of rules) {
      try {
        await this.maybeTrigger(rule);
      } catch (err) {
        this.logger.warn(
          `auto-topup scheduling failed user=${rule.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async maybeTrigger(
    rule: {
      userId: string;
      threshold: Prisma.Decimal;
      topupAmount: Prisma.Decimal;
      currency: string;
      paymentMethodId: string | null;
      user: {
        email: string;
        firstName: string | null;
        walletBalance: Prisma.Decimal;
        walletCurrency: string;
        stripeCustomerId: string | null;
        defaultPaymentMethodId: string | null;
      };
    },
  ): Promise<void> {
    if (rule.user.walletCurrency !== rule.currency) {
      return;
    }
    if (rule.user.walletBalance.gte(rule.threshold)) {
      return;
    }
    if (!rule.user.stripeCustomerId) {
      return;
    }

    let stripePm = rule.user.defaultPaymentMethodId ?? null;
    if (rule.paymentMethodId) {
      const pmRow = await this.prisma.paymentMethod.findFirst({
        where: {
          userId: rule.userId,
          id: rule.paymentMethodId,
          provider: 'STRIPE',
        },
      });
      stripePm = pmRow?.providerRef ?? null;
    }

    if (!stripePm?.startsWith('pm_')) {
      await this.touchFailure(
        rule.userId,
        'Brak zapisanej karty Stripe (pm_) — ustaw domyślną metodę płatności.',
        null,
        rule,
      );
      return;
    }

    const minor = Math.round(rule.topupAmount.toNumber() * 100);
    if (minor < 100) return;

    const piIdempotencyKey = `auto-topup:intent:${rule.userId}:${Math.floor(Date.now() / COOLDOWN_MS)}`;

    try {
      const pi = await this.stripe.createOffSessionPaymentIntent({
        customerId: rule.user.stripeCustomerId,
        stripePaymentMethodId: stripePm,
        amountMinor: minor,
        currency: rule.currency,
        metadata: {
          verris_kind: 'wallet_auto_topup',
          verris_user_id: rule.userId,
        },
        idempotencyKey: piIdempotencyKey,
      });

      await this.prisma.walletAutoTopup.update({
        where: { userId: rule.userId },
        data: {
          lastAttemptAt: new Date(),
          lastAttemptOk: pi.status === 'succeeded',
          lastAttemptError: pi.status === 'succeeded' ? null : `status=${pi.status}`,
          cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
        },
      });

      if (pi.status === 'requires_action') {
        await this.touchFailure(
          rule.userId,
          'Karta wymaga dodatkowej autoryzacji (3DS) — zmień metodę płatności lub doładuj przez Checkout.',
          pi.id,
          rule,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.touchFailure(rule.userId, msg, null, rule);
    }
  }

  private async touchFailure(
    userId: string,
    msg: string,
    stripeRef?: string | null,
    rule?: { topupAmount: Prisma.Decimal; user: { email: string; firstName: string | null } },
  ) {
    await this.prisma.walletAutoTopup.updateMany({
      where: { userId },
      data: {
        lastAttemptAt: new Date(),
        lastAttemptOk: false,
        lastAttemptError: msg.slice(0, 2000),
        cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
      },
    });
    await this.audit.record({
      action: 'WALLET_AUTO_TOPUP_FAILED',
      userId,
      details: { message: msg.slice(0, 500), stripeRef: stripeRef ?? null },
    });
    if (rule?.user.email) {
      const panelUrl = (this.config.get<string>('clientPanelUrl') ?? 'https://panel.verris.pl').replace(
        /\/$/,
        '',
      );
      const tpl = walletAutoTopupFailedTemplate({
        to: rule.user.email,
        firstName: rule.user.firstName,
        reason: msg,
        topupAmountPln: rule.topupAmount.toFixed(2),
        panelUrl,
      });
      await this.mailer.send({
        ...tpl,
        userId,
        category: 'TRANSACTIONAL',
      });
    }
  }
}


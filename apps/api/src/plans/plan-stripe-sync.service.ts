import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Plan } from '@verris/database';
import { StripeService } from '../billing/stripe/stripe.service';
import type { StripePrice } from '../billing/stripe/stripe.client';

export interface PlanStripeRefs {
  stripeProductId: string;
  stripePriceMonthlyId: string;
  stripePriceYearlyId: string;
}

@Injectable()
export class PlanStripeSyncService {
  private readonly logger = new Logger(PlanStripeSyncService.name);

  constructor(private readonly stripe: StripeService) {}

  /**
   * Creates/updates Stripe Product and ensures recurring Prices match plan amounts.
   * Stripe Prices are immutable — amount changes create a new Price and archive the old one.
   */
  async syncPlan(plan: Plan): Promise<PlanStripeRefs> {
    if (!this.stripe.isConfigured()) {
      throw new BadRequestException(
        'Stripe nie jest skonfigurowany (STRIPE_SECRET_KEY). Uzupełnij klucze albo podaj Price ID ręcznie.',
      );
    }

    const currency = (plan.currency ?? 'PLN').toLowerCase();
    const monthlyMinor = amountToMinorUnits(Number(plan.priceMonthly), currency);
    const yearlyMinor = amountToMinorUnits(Number(plan.priceYearly), currency);

    const productId = await this.ensureProduct(plan);

    const stripePriceMonthlyId = await this.ensureRecurringPrice({
      plan,
      productId,
      currentPriceId: plan.stripePriceMonthlyId,
      unitAmountMinor: monthlyMinor,
      currency,
      interval: 'month',
    });

    const stripePriceYearlyId = await this.ensureRecurringPrice({
      plan,
      productId,
      currentPriceId: plan.stripePriceYearlyId,
      unitAmountMinor: yearlyMinor,
      currency,
      interval: 'year',
    });

    this.logger.log(
      `Plan ${plan.slug} synced to Stripe: product=${productId} month=${stripePriceMonthlyId} year=${stripePriceYearlyId}`,
    );

    return { stripeProductId: productId, stripePriceMonthlyId, stripePriceYearlyId };
  }

  private async ensureProduct(plan: Plan): Promise<string> {
    const metadata = {
      verris_plan_id: plan.id,
      verris_plan_slug: plan.slug,
    };
    const description = plan.description?.trim() || undefined;

    if (plan.stripeProductId) {
      await this.stripe.updateProduct(plan.stripeProductId, {
        name: plan.name,
        ...(description ? { description } : {}),
        metadata,
      });
      return plan.stripeProductId;
    }

    const created = await this.stripe.createProduct({
      name: plan.name,
      description,
      metadata,
    });
    return created.id;
  }

  private async ensureRecurringPrice(opts: {
    plan: Plan;
    productId: string;
    currentPriceId: string | null;
    unitAmountMinor: number;
    currency: string;
    interval: 'month' | 'year';
  }): Promise<string> {
    if (opts.currentPriceId) {
      const existing = await this.stripe.retrievePriceOrThrow(opts.currentPriceId);
      if (priceMatchesPlan(existing, opts)) {
        return opts.currentPriceId;
      }
      if (existing.active) {
        await this.stripe.deactivatePrice(opts.currentPriceId);
        this.logger.log(
          `Archived Stripe price ${opts.currentPriceId} for plan ${opts.plan.slug} (${opts.interval})`,
        );
      }
    }

    const nickname = `${opts.plan.slug}-${opts.interval}`;
    const created = await this.stripe.createRecurringPrice({
      productId: opts.productId,
      unitAmountMinor: opts.unitAmountMinor,
      currency: opts.currency,
      interval: opts.interval,
      nickname,
      metadata: {
        verris_plan_id: opts.plan.id,
        verris_plan_slug: opts.plan.slug,
        verris_interval: opts.interval,
      },
      idempotencyKey: `plan-${opts.plan.id}-${opts.interval}-${opts.unitAmountMinor}-${opts.currency}`,
    });
    return created.id;
  }
}

function amountToMinorUnits(amount: number, currency: string): number {
  const zeroDecimal = new Set(['jpy', 'krw', 'vnd']);
  const c = currency.toLowerCase();
  if (zeroDecimal.has(c)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

function priceMatchesPlan(
  stripe: StripePrice,
  opts: { unitAmountMinor: number; currency: string; interval: 'month' | 'year' },
): boolean {
  if (!stripe.active) return false;
  if (stripe.type !== 'recurring' || !stripe.recurring) return false;
  if (stripe.recurring.interval !== opts.interval || stripe.recurring.interval_count !== 1) {
    return false;
  }
  if (stripe.recurring.usage_type !== 'licensed') return false;
  if (stripe.currency.toLowerCase() !== opts.currency.toLowerCase()) return false;
  if (stripe.unit_amount === null) return false;
  return stripe.unit_amount === opts.unitAmountMinor;
}

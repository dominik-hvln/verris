import { BillingInterval, Prisma } from '@verris/database';

export type PlanChangeDirection = 'none' | 'upgrade' | 'downgrade';

const MS_PER_DAY = 86_400_000;

/** Reference length for cross-interval proration (PC-4). */
export function referencePeriodMs(interval: BillingInterval): number {
  return interval === BillingInterval.YEAR ? 365 * MS_PER_DAY : 30 * MS_PER_DAY;
}

export function billingPeriodEndFrom(start: Date, interval: BillingInterval): Date {
  const end = new Date(start);
  if (interval === BillingInterval.YEAR) {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}

export interface PlanProrationInput {
  oldPeriodPrice: Prisma.Decimal | number | string;
  newPeriodPrice: Prisma.Decimal | number | string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
  /** When set and different from currentInterval, uses cross-interval proration (PC-4). */
  targetInterval?: BillingInterval;
  currentInterval?: BillingInterval;
}

export interface PlanProrationResult {
  remainingFraction: number;
  amountDue: Prisma.Decimal;
  amountCredit: Prisma.Decimal;
  direction: PlanChangeDirection;
}

function toDecimal(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

/**
 * Proportional charge/credit for the unused portion of the current billing period.
 * Uses subscription snapshot price for the old plan and target list price for the new plan.
 */
export function computePlanChangeProration(input: PlanProrationInput): PlanProrationResult {
  const oldPrice = toDecimal(input.oldPeriodPrice);
  const newPrice = toDecimal(input.newPeriodPrice);
  const startMs = input.periodStart.getTime();
  const endMs = input.periodEnd.getTime();
  const nowMs = (input.now ?? new Date()).getTime();

  const periodMs = endMs - startMs;
  if (periodMs <= 0) {
    return {
      remainingFraction: 0,
      amountDue: new Prisma.Decimal(0),
      amountCredit: new Prisma.Decimal(0),
      direction: 'none',
    };
  }

  const remainingMs = Math.max(0, Math.min(periodMs, endMs - nowMs));
  const fractionCurrent = new Prisma.Decimal(remainingMs).div(periodMs);

  const intervalChanges =
    input.targetInterval != null &&
    input.currentInterval != null &&
    input.targetInterval !== input.currentInterval;

  const oldCredit = oldPrice.mul(fractionCurrent);
  const newCost = intervalChanges
    ? newPrice.mul(
        new Prisma.Decimal(remainingMs).div(referencePeriodMs(input.targetInterval!)),
      )
    : newPrice.mul(fractionCurrent);
  const net = newCost.minus(oldCredit);
  const fraction = fractionCurrent;

  const round2 = (d: Prisma.Decimal) =>
    d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  if (net.greaterThan(0)) {
    return {
      remainingFraction: Number(fraction.toFixed(6)),
      amountDue: round2(net),
      amountCredit: new Prisma.Decimal(0),
      direction: 'upgrade',
    };
  }
  if (net.lessThan(0)) {
    return {
      remainingFraction: Number(fraction.toFixed(6)),
      amountDue: new Prisma.Decimal(0),
      amountCredit: round2(net.negated()),
      direction: 'downgrade',
    };
  }
  return {
    remainingFraction: Number(fraction.toFixed(6)),
    amountDue: new Prisma.Decimal(0),
    amountCredit: new Prisma.Decimal(0),
    direction: 'none',
  };
}

export function planPriceForInterval(
  plan: { priceMonthly: Prisma.Decimal; priceYearly: Prisma.Decimal },
  interval: BillingInterval,
): Prisma.Decimal {
  return interval === BillingInterval.YEAR ? plan.priceYearly : plan.priceMonthly;
}

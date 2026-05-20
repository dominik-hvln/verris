import { Prisma } from '@verris/database';

export type PlanChangeDirection = 'none' | 'upgrade' | 'downgrade';

export interface PlanProrationInput {
  oldPeriodPrice: Prisma.Decimal | number | string;
  newPeriodPrice: Prisma.Decimal | number | string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
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
  const fraction = new Prisma.Decimal(remainingMs).div(periodMs);

  const oldCredit = oldPrice.mul(fraction);
  const newCost = newPrice.mul(fraction);
  const net = newCost.minus(oldCredit);

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
  interval: 'MONTH' | 'YEAR',
): Prisma.Decimal {
  return interval === 'YEAR' ? plan.priceYearly : plan.priceMonthly;
}

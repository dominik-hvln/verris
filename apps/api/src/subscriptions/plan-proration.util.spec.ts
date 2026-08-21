import { BillingInterval, Prisma } from '@verris/database';
import {
  billingPeriodEndFrom,
  computePlanChangeProration,
  referencePeriodMs,
} from './plan-proration.util';

describe('computePlanChangeProration', () => {
  const periodStart = new Date('2026-01-01T00:00:00Z');
  const periodEnd = new Date('2026-01-31T00:00:00Z');
  const midPeriod = new Date('2026-01-16T00:00:00Z');

  it('charges half-period upgrade delta', () => {
    const result = computePlanChangeProration({
      oldPeriodPrice: 100,
      newPeriodPrice: 200,
      periodStart,
      periodEnd,
      now: midPeriod,
    });
    expect(result.direction).toBe('upgrade');
    expect(result.amountDue.toFixed(2)).toBe('50.00');
    expect(result.amountCredit.toFixed(2)).toBe('0.00');
  });

  it('credits half-period downgrade delta', () => {
    const result = computePlanChangeProration({
      oldPeriodPrice: 200,
      newPeriodPrice: 100,
      periodStart,
      periodEnd,
      now: midPeriod,
    });
    expect(result.direction).toBe('downgrade');
    expect(result.amountCredit.toFixed(2)).toBe('50.00');
    expect(result.amountDue.toFixed(2)).toBe('0.00');
  });

  it('returns none when prices match for remaining fraction', () => {
    const result = computePlanChangeProration({
      oldPeriodPrice: 120,
      newPeriodPrice: 120,
      periodStart,
      periodEnd,
      now: new Date('2026-01-20T00:00:00Z'),
    });
    expect(result.direction).toBe('none');
    expect(result.amountDue.toFixed(2)).toBe('0.00');
    expect(result.amountCredit.toFixed(2)).toBe('0.00');
  });

  it('uses one day remaining on monthly plan', () => {
    const result = computePlanChangeProration({
      oldPeriodPrice: new Prisma.Decimal('30.00'),
      newPeriodPrice: new Prisma.Decimal('60.00'),
      periodStart,
      periodEnd,
      now: new Date('2026-01-30T12:00:00Z'),
    });
    expect(result.direction).toBe('upgrade');
    expect(result.amountDue.greaterThan(0)).toBe(true);
    expect(result.amountDue.lessThanOrEqualTo(2)).toBe(true);
  });

  it('cross-interval MONTH→YEAR prorates new cost against year reference period', () => {
    const result = computePlanChangeProration({
      oldPeriodPrice: 100,
      newPeriodPrice: 2400,
      periodStart,
      periodEnd,
      now: midPeriod,
      currentInterval: BillingInterval.MONTH,
      targetInterval: BillingInterval.YEAR,
    });
    expect(result.direction).toBe('upgrade');
    expect(result.amountDue.greaterThan(0)).toBe(true);
    expect(result.amountCredit.toFixed(2)).toBe('0.00');
  });

  it('referencePeriodMs differs for month and year', () => {
    expect(referencePeriodMs(BillingInterval.MONTH)).toBeLessThan(
      referencePeriodMs(BillingInterval.YEAR),
    );
  });

  it('billingPeriodEndFrom advances one month', () => {
    const start = new Date('2026-03-01T00:00:00Z');
    const end = billingPeriodEndFrom(start, BillingInterval.MONTH);
    expect(end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

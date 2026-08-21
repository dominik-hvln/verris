import { AutoscalingResource } from '@verris/database';
import { Prisma } from '@verris/database';
import {
  assertUniqueActiveTierThreshold,
  hourlyCostBreakdownForCatalogAmounts,
} from './autoscaling-pricing.util';

function rule(
  resource: AutoscalingResource,
  price: string,
  threshold: number,
  unit: string,
) {
  return {
    id: `${resource}-${threshold}`,
    resource,
    unit,
    pricePerUnit: new Prisma.Decimal(price),
    currency: 'PLN',
    thresholdAbove: threshold,
    isActive: true,
    validFrom: new Date(),
    validUntil: null,
    notes: null,
    createdAt: new Date(),
  };
}

describe('hourlyCostBreakdownForCatalogAmounts', () => {
  it('applies tier with higher threshold when usage exceeds it', () => {
    const rules = [
      rule(AutoscalingResource.RAM, '0.10', 0, 'ram_gb'),
      rule(AutoscalingResource.RAM, '0.20', 5, 'ram_gb'),
    ];
    const low = hourlyCostBreakdownForCatalogAmounts(rules, { cpuPercent: 0, ramGb: 2, diskGb: 0 });
    const high = hourlyCostBreakdownForCatalogAmounts(rules, { cpuPercent: 0, ramGb: 8, diskGb: 0 });
    expect(low.ram).toBeCloseTo(0.2, 4);
    expect(high.ram).toBeCloseTo(1.6, 4);
  });
});

describe('assertUniqueActiveTierThreshold', () => {
  it('rejects duplicate active threshold for same resource', () => {
    expect(() =>
      assertUniqueActiveTierThreshold(
        [{ id: 'a', resource: AutoscalingResource.CPU, thresholdAbove: 10, isActive: true }],
        { resource: AutoscalingResource.CPU, thresholdAbove: 10, isActive: true },
      ),
    ).toThrow(/już istnieje/);
  });

  it('allows same threshold when previous rule is inactive', () => {
    expect(() =>
      assertUniqueActiveTierThreshold(
        [{ id: 'a', resource: AutoscalingResource.CPU, thresholdAbove: 10, isActive: false }],
        { resource: AutoscalingResource.CPU, thresholdAbove: 10, isActive: true },
      ),
    ).not.toThrow();
  });
});

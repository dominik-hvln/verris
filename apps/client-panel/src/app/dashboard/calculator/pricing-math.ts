import type { AutoscalingResource, PriceRuleDto } from './types';

const MB_PER_GB = 1024;

function toRuleBillingUnits(
  resource: AutoscalingResource,
  catalogAmount: number,
  ruleUnit: string,
): number {
  if (catalogAmount <= 0) return 0;
  if (resource === 'CPU') return catalogAmount;
  if (ruleUnit.endsWith('_gb')) return catalogAmount;
  if (ruleUnit.endsWith('_mb')) return catalogAmount * MB_PER_GB;
  return catalogAmount;
}

function thresholdInCatalogUnits(
  resource: AutoscalingResource,
  rule: PriceRuleDto,
): number {
  if (resource === 'CPU') return rule.thresholdAbove;
  if (rule.unit.endsWith('_mb')) return rule.thresholdAbove / MB_PER_GB;
  return rule.thresholdAbove;
}

/**
 * Hourly rate (PLN/h) for one resource at a given catalog amount (CPU %, RAM GB, disk GB).
 */
export function hourlyRateForResource(
  rules: PriceRuleDto[],
  resource: AutoscalingResource,
  catalogAmount: number,
): number {
  if (catalogAmount <= 0) return 0;
  const candidates = rules
    .filter((r) => r.resource === resource && r.isActive)
    .sort((a, b) => b.thresholdAbove - a.thresholdAbove);
  if (candidates.length === 0) return 0;

  const rule =
    candidates.find((r) => catalogAmount >= thresholdInCatalogUnits(resource, r)) ??
    candidates[candidates.length - 1];

  const billable = toRuleBillingUnits(resource, catalogAmount, rule.unit);
  return billable * Number.parseFloat(rule.pricePerUnit);
}

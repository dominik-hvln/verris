import { AutoscalingPriceRule, AutoscalingResource } from '@verris/database';

export const MB_PER_GB = 1024;

/** Catalog / calculator amounts: CPU in %, RAM and DISK in GB. */
export interface AutoscalingCatalogAmounts {
  cpuPercent: number;
  ramGb: number;
  diskGb: number;
}

/**
 * Converts catalog amounts to the unit required by a price rule (supports legacy mb rules).
 */
export function toRuleBillingUnits(
  resource: AutoscalingResource,
  catalogAmount: number,
  ruleUnit: string,
): number {
  if (catalogAmount <= 0) return 0;
  if (resource === AutoscalingResource.CPU) return catalogAmount;
  if (ruleUnit.endsWith('_gb')) return catalogAmount;
  if (ruleUnit.endsWith('_mb')) return catalogAmount * MB_PER_GB;
  return catalogAmount;
}

export function hourlyCostForCatalogAmounts(
  rules: AutoscalingPriceRule[],
  amounts: AutoscalingCatalogAmounts,
): number {
  const accrue = (resource: AutoscalingResource, catalogUnits: number): number => {
    if (catalogUnits <= 0) return 0;
    const list = rules
      .filter((r) => r.resource === resource && r.isActive)
      .sort((a, b) => b.thresholdAbove - a.thresholdAbove);
    if (list.length === 0) return 0;

    const rule =
      list.find((r) => {
        const thresholdCatalog =
          r.unit.endsWith('_mb') && resource !== AutoscalingResource.CPU
            ? r.thresholdAbove / MB_PER_GB
            : r.thresholdAbove;
        return catalogUnits >= thresholdCatalog;
      }) ?? list[list.length - 1];

    const billable = toRuleBillingUnits(resource, catalogUnits, rule.unit);
    return billable * Number(rule.pricePerUnit);
  };

  return (
    accrue(AutoscalingResource.CPU, amounts.cpuPercent) +
    accrue(AutoscalingResource.RAM, amounts.ramGb) +
    accrue(AutoscalingResource.DISK, amounts.diskGb)
  );
}

/** Engine billing: scaled RAM is stored in MB on the account. */
export function scaledRamMbToCatalogGb(scaledRamMb: number): number {
  return scaledRamMb / MB_PER_GB;
}

/** Engine billing: scaled disk is stored in MB on the account. */
export function scaledDiskMbToCatalogGb(scaledDiskMb: number): number {
  return scaledDiskMb / MB_PER_GB;
}

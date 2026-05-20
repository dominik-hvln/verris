import { AutoscalingResource } from '@verris/database';

/** Resources shown in public catalog, calculator, and new admin rules. */
export const AUTOSCALING_CATALOG_RESOURCES: AutoscalingResource[] = [
  AutoscalingResource.CPU,
  AutoscalingResource.RAM,
  AutoscalingResource.DISK,
];

export const AUTOSCALING_UNIT_BY_RESOURCE: Record<AutoscalingResource, string> = {
  [AutoscalingResource.CPU]: 'cpu_pct',
  [AutoscalingResource.RAM]: 'ram_gb',
  [AutoscalingResource.DISK]: 'disk_gb',
  [AutoscalingResource.IO]: 'io_kbps',
  [AutoscalingResource.TRANSFER]: 'transfer_gb',
};

export function isCatalogAutoscalingResource(
  resource: AutoscalingResource,
): resource is (typeof AUTOSCALING_CATALOG_RESOURCES)[number] {
  return AUTOSCALING_CATALOG_RESOURCES.includes(resource);
}

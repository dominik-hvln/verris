import { grafanaDashboardUrl } from "@verris/contracts";

/** Docelowy URL Grafany (po SSO). */
export function grafanaOpsHref(): string | null {
  return grafanaDashboardUrl(process.env.NEXT_PUBLIC_GRAFANA_URL);
}

/** Hop SSO — ustawia cookie na `.verris.pl` i przekierowuje do Grafany. */
export function grafanaSsoHref(): string | null {
  const target = grafanaOpsHref();
  if (!target) return null;
  return `/grafana/sso?to=${encodeURIComponent(target)}`;
}

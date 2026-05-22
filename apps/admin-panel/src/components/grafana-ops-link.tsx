import { Activity } from "lucide-react";
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

/** Link do Grafany (admin — zawsze gdy URL skonfigurowany). */
export function GrafanaOpsLink() {
  const href = grafanaSsoHref();
  if (!href) return null;

  return (
    <a
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-sm text-violet-200 transition hover:border-violet-400/40 hover:bg-violet-500/15"
    >
      <Activity className="h-4 w-4 shrink-0 text-violet-300" />
      <span className="font-medium">Monitoring Grafana</span>
      <span className="text-[10px] text-violet-400/80 group-hover:text-violet-300">
        Storage &amp; backupy
      </span>
    </a>
  );
}

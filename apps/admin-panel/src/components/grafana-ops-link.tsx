import { Activity } from "lucide-react";

const DASHBOARD_PATH = "/d/verris-ops-storage/verris-ops-storage";

export function grafanaOpsHref(): string | null {
  const base = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${DASHBOARD_PATH}`;
}

/** Link do Grafany (admin — zawsze gdy URL skonfigurowany). */
export function GrafanaOpsLink() {
  const href = grafanaOpsHref();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
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

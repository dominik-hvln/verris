import { Activity } from "lucide-react";

const DASHBOARD_PATH = "/d/verris-ops-storage/verris-ops-storage";

export function grafanaOpsHref(): string | null {
  const base = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${DASHBOARD_PATH}`;
}

export function canShowGrafanaLink(session: {
  role: string;
  canAccessGrafana?: boolean;
}): boolean {
  if (session.role === "ADMIN") return true;
  return Boolean(session.canAccessGrafana);
}

export function GrafanaOpsLink({
  session,
}: {
  session: { role: string; canAccessGrafana?: boolean };
}) {
  if (!canShowGrafanaLink(session)) return null;
  const href = grafanaOpsHref();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/15"
    >
      <Activity className="h-4 w-4 shrink-0" />
      <span>Monitoring Grafana</span>
    </a>
  );
}

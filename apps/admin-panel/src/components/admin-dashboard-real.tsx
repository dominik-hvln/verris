import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  HardDrive,
  Users,
  DollarSign,
  Ticket,
  Server as ServerIcon,
} from "lucide-react";
import type { AdminDashboardOverview } from "@/lib/admin-overview-data";

function plMoney(s: string) {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function heartbeatLabel(iso: string | null): string {
  if (!iso) return "Brak heartbeat";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "Na żywo";
  if (mins < 120) return `${mins} min temu`;
  return d.toLocaleString("pl-PL");
}

const serverStatusStyle: Record<string, string> = {
  ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  OFFLINE: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  MAINTENANCE: "border-amber-500/25 bg-amber-500/10 text-amber-100",
  INIT: "border-white/10 bg-white/5 text-neutral-300",
  PENDING_APPROVAL: "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
  DEPROVISIONING: "border-white/10 bg-white/5 text-neutral-400",
};

export function AdminDashboardReal({ o }: { o: AdminDashboardOverview }) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">Pulpit</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Dane z bazy i ledgera (wygenerowano: {new Date(o.generatedAt).toLocaleString("pl-PL")}).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Klienci (USER)"
          value={String(o.users.clients)}
          hint={`Łącznie kont w systemie: ${o.users.total} (personel: ${o.users.staffAndAdmin})`}
          icon={<Users className="h-6 w-6 text-indigo-400" />}
          tone="indigo"
        />
        <StatCard
          title="Aktywne subskrypcje"
          value={String(o.subscriptions.active)}
          hint="Status ACTIVE w modelu Subscription"
          icon={<Activity className="h-6 w-6 text-emerald-400" />}
          tone="emerald"
        />
        <StatCard
          title="Węzły (ACTIVE / wszystkie)"
          value={`${o.servers.active} / ${o.servers.total}`}
          hint="Model Server — gotowe do hostingu vs. wszystkie rekordy"
          icon={<ServerIcon className="h-6 w-6 text-cyan-400" />}
          tone="cyan"
        />
        <StatCard
          title="Tickety (otwarte / w toku)"
          value={String(o.tickets.openNonClosed)}
          hint="OPEN lub IN_PROGRESS"
          icon={<Ticket className="h-6 w-6 text-orange-400" />}
          tone="orange"
          href="/tickets"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Portfel — {o.billing.periodDays} dni</h2>
          </div>
          <p className="text-3xl font-bold text-white tabular-nums">{plMoney(o.billing.walletNetPln)} PLN</p>
          <p className="text-xs text-muted-foreground mt-2">Netto COMPLETED (wpływy − obciążenia).</p>
          <Link
            href="/billing"
            className="mt-4 inline-block text-sm text-indigo-400 hover:underline"
          >
            Rozliczenia i eksport CSV →
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Konta hostingowe (DA)</h2>
          </div>
          <p className="text-3xl font-bold text-white">{o.accounts.total}</p>
          <p className="text-xs text-muted-foreground mt-2">Rekordy Account w bazie.</p>
          <Link href="/subscriptions" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
            Lista subskrypcji →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-indigo-400" />
            Węzły (ostatnie {o.serverRows.length})
          </h2>
          <div className="space-y-3">
            {o.serverRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak serwerów w bazie.</p>
            ) : (
              o.serverRows.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-colors"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs font-bold uppercase ${
                      serverStatusStyle[node.status] ?? "border-white/10 bg-white/5 text-white"
                    }`}
                  >
                    {node.status.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{node.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {node.region ?? "—"} · {node.ipAddress} · {heartbeatLabel(node.lastHeartbeatAt)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    alloc CPU {node.allocatedCpu}
                    {node.totalCpuCores != null ? ` / ${node.totalCpuCores} rdzeni` : ""}
                  </div>
                </Link>
              ))
            )}
          </div>
          <Link href="/nodes" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
            Wszystkie węzły →
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Ostatnie subskrypcje</h2>
          <div className="space-y-3">
            {o.recentSubscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak rekordów.</p>
            ) : (
              o.recentSubscriptions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{s.user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.plan.name} · {s.status} · {s.interval}
                    </p>
                  </div>
                  <Link
                    href={`/subscriptions/${s.id}`}
                    className="shrink-0 text-xs text-indigo-400 hover:underline"
                  >
                    JSON
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
  tone,
  href,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "indigo" | "emerald" | "cyan" | "orange";
  href?: string;
}) {
  const ring =
    tone === "indigo"
      ? "from-indigo-500/80 to-purple-600/80"
      : tone === "emerald"
        ? "from-emerald-500/80 to-teal-600/80"
        : tone === "cyan"
          ? "from-cyan-500/80 to-blue-600/80"
          : "from-orange-500/80 to-amber-600/80";

  const content = (
    <div className="relative overflow-hidden rounded-2xl p-[1px]">
      <div className={`absolute inset-0 bg-linear-to-br ${ring} rounded-2xl blur-lg opacity-35`} />
      <div className="relative flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums">{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p>
        </div>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="block hover:opacity-90 transition-opacity">
      {content}
    </Link>
  );
}

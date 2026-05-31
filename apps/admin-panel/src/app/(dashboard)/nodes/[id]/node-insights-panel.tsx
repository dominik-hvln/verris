"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Gauge, Layers } from "lucide-react";
import {
  fetchNodeAccounts,
  fetchNodeUsage,
  type NodeAccountRow,
  type NodeAccountsResponse,
  type NodeUsageResponse,
} from "../actions";

function Bar({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number | null;
  unit: string;
}) {
  const pct = max && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = pct >= 90 ? "bg-rose-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-white">
          {value.toLocaleString("pl-PL")}
          {max ? ` / ${max.toLocaleString("pl-PL")}` : ""}
          {unit} {max ? <span className="text-muted-foreground">({pct.toFixed(0)}%)</span> : null}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtMb(mb: number | null | undefined): string {
  if (!mb) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function NodeInsightsPanel({ serverId }: { serverId: string }) {
  const [usage, setUsage] = useState<NodeUsageResponse | null>(null);
  const [accounts, setAccounts] = useState<NodeAccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([
        fetchNodeUsage(serverId, "24h"),
        fetchNodeAccounts(serverId),
      ]);
      setUsage(u);
      setAccounts(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać danych węzła.");
    }
  }, [serverId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const chart = useMemo(() => usage?.series.slice(-48) ?? [], [usage]);
  const maxCpuInChart = useMemo(
    () => Math.max(1, ...chart.map((r) => r.cpuUsageAvg)),
    [chart],
  );
  const l = usage?.latest;
  const srv = usage?.server;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Gauge className="h-4 w-4 text-cyan-300" /> Zużycie węzła (LVE, suma kont)
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              na żywo
            </span>
          </h2>
          {usage ? (
            <span className="text-[10px] text-muted-foreground">
              {usage.activeAccountCount}/{usage.accountCount} kont aktywnych
            </span>
          ) : null}
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {!usage ? (
          <p className="text-sm text-muted-foreground">Wczytywanie…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Bar label="CPU (realne)" value={Math.round(l?.cpuUsageAvg ?? 0)} max={null} unit="%" />
              <Bar
                label="RAM (suma)"
                value={Math.round(l?.memUsageAvgMb ?? 0)}
                max={srv?.totalMemoryMb ?? null}
                unit=" MB"
              />
              <Bar
                label="Dysk (suma)"
                value={Math.round(l?.diskUsageMb ?? 0)}
                max={srv?.totalDiskMb ?? null}
                unit=" MB"
              />
              <Bar label="I/O (suma)" value={Math.round(l?.ioUsageKbps ?? 0)} max={null} unit=" KB/s" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Bar
                label="Alokacja CPU"
                value={srv?.allocatedCpu ?? 0}
                max={srv?.totalCpuCores ? srv.totalCpuCores * 100 : null}
                unit="%"
              />
              <Bar
                label="Alokacja RAM"
                value={srv?.allocatedMemory ?? 0}
                max={srv?.totalMemoryMb ?? null}
                unit=" MB"
              />
              <Bar
                label="Alokacja dysku"
                value={srv?.allocatedDisk ?? 0}
                max={srv?.totalDiskMb ?? null}
                unit=" MB"
              />
            </div>

            {usage.scaledTotals.cpu > 0 ||
            usage.scaledTotals.ramMb > 0 ||
            usage.scaledTotals.diskMb > 0 ? (
              <p className="text-[11px] text-cyan-200">
                Autoskalowanie na węźle: CPU +{usage.scaledTotals.cpu}% · RAM +
                {usage.scaledTotals.ramMb} MB · Dysk +{usage.scaledTotals.diskMb} MB
              </p>
            ) : null}

            {chart.length === 0 ? (
              <p className="text-xs text-muted-foreground">Brak metryk w ostatnich 24 h.</p>
            ) : (
              <div className="flex h-24 items-end gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                {chart.map((row) => (
                  <div
                    key={row.bucketStart}
                    className="min-w-0.5 flex-1 rounded-t bg-cyan-400/70"
                    title={`${new Date(row.bucketStart).toLocaleString("pl-PL")}: CPU ${row.cpuUsageAvg}% · RAM ${fmtMb(row.memUsageAvgMb)}`}
                    style={{ height: `${Math.max(3, (row.cpuUsageAvg / maxCpuInChart) * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Layers className="h-4 w-4 text-indigo-300" /> Konta na węźle
          {accounts ? (
            <span className="text-[10px] text-muted-foreground">({accounts.count})</span>
          ) : null}
        </div>

        {!accounts ? (
          <p className="text-sm text-muted-foreground">Wczytywanie…</p>
        ) : accounts.count === 0 ? (
          <p className="text-sm text-muted-foreground">Brak kont hostingowych na tym węźle.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Domena / konto</th>
                  <th className="py-2 pr-3 font-medium">Właściciel</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">CPU</th>
                  <th className="py-2 pr-3 font-medium">RAM</th>
                  <th className="py-2 pr-3 font-medium">Dysk</th>
                </tr>
              </thead>
              <tbody>
                {accounts.accounts.map((a) => (
                  <AccountRow key={a.id} a={a} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountRow({ a }: { a: NodeAccountRow }) {
  const scaled = a.scaledCpu > 0 || a.scaledRamMb > 0 || a.scaledDiskMb > 0;
  const cpu = a.latest ? Math.round(a.latest.cpuUsageAvg) : null;
  const ram = a.latest ? Math.round(a.latest.memUsageAvgMb) : null;
  const disk = a.latest ? Math.round(a.latest.diskUsageMb) : null;
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-2 pr-3">
        <Link
          href={`/subscriptions/${a.subscriptionId}`}
          className="font-medium text-white hover:text-cyan-300"
        >
          {a.domain}
        </Link>
        <div className="text-[11px] text-muted-foreground font-mono">{a.daUsername}</div>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{a.ownerEmail ?? "—"}</td>
      <td className="py-2 pr-3 text-muted-foreground">{a.planName ?? "—"}</td>
      <td className="py-2 pr-3">
        <StatusBadge status={a.status} />
        {scaled ? (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] text-cyan-200">
            <Activity className="h-2.5 w-2.5" /> skalowane
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-white tabular-nums">
        {cpu !== null ? `${cpu}%` : "—"}
        <span className="text-[10px] text-muted-foreground"> / {a.cpuLimit}%</span>
      </td>
      <td className="py-2 pr-3 text-white tabular-nums">
        {ram !== null ? fmtMb(ram) : "—"}
        <span className="text-[10px] text-muted-foreground"> / {fmtMb(a.ramLimitMb)}</span>
      </td>
      <td className="py-2 pr-3 text-white tabular-nums">
        {disk !== null ? fmtMb(disk) : "—"}
        <span className="text-[10px] text-muted-foreground"> / {fmtMb(a.diskLimitMb)}</span>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : status === "SUSPENDED"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
        : "border-white/15 bg-white/5 text-neutral-300";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

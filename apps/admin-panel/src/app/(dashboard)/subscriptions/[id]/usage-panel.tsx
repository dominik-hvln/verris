"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSubscriptionUsageAction, AdminServiceUsage } from "./usage-actions";

function Bar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = pct >= 90 ? "bg-rose-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-white">
          {value.toLocaleString("pl-PL")} / {max.toLocaleString("pl-PL")}
          {unit} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ServiceUsagePanel({ subscriptionId }: { subscriptionId: string }) {
  const [data, setData] = useState<AdminServiceUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchSubscriptionUsageAction(subscriptionId, "24h"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać metryk.");
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const chart = useMemo(() => data?.rows.slice(-48) ?? [], [data]);
  const a = data?.account;
  const l = data?.latest;

  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          Zużycie usługi (LVE)
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            na żywo
          </span>
        </h2>
        {a ? (
          <span className="text-[10px] text-muted-foreground">
            {a.daUsername} · limit efektywny (plan + autoskalowanie)
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {!data ? (
        <p className="text-sm text-muted-foreground">Wczytywanie…</p>
      ) : !a ? (
        <p className="text-sm text-muted-foreground">Brak konta hostingowego.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Bar label="CPU" value={l?.cpuUsageAvg ?? 0} max={a.cpuLimit} unit="%" />
            <Bar label="RAM" value={Math.round(l?.memUsageAvgMb ?? 0)} max={a.ramLimitMb} unit=" MB" />
            <Bar label="Dysk" value={Math.round(l?.diskUsageMb ?? 0)} max={a.diskLimitMb} unit=" MB" />
            <Bar label="I/O" value={Math.round(l?.ioUsageKbps ?? 0)} max={a.ioLimitKbps} unit=" KB/s" />
          </div>

          {a.scaledCpu > 0 || a.scaledRamMb > 0 || a.scaledDiskMb > 0 ? (
            <p className="text-[11px] text-cyan-200">
              Autoskalowanie aktywne: CPU +{a.scaledCpu}% · RAM +{a.scaledRamMb} MB · Dysk +{a.scaledDiskMb} MB
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
                  title={`${new Date(row.bucketStart).toLocaleString("pl-PL")}: CPU ${row.cpuUsageAvg}%`}
                  style={{ height: `${Math.max(3, Math.min(100, row.cpuUsageAvg))}%` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

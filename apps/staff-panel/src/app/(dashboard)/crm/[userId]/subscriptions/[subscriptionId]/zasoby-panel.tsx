"use client";

import { useEffect, useState } from "react";
import { pobierzZuzycieAction, type Wynik, type ZuzycieUslugi } from "./obsluga-actions";

function Pasek({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const kolor = pct >= 90 ? "bg-rose-400" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-white">
          {value.toLocaleString("pl-PL")} / {max > 0 ? `${max.toLocaleString("pl-PL")}${unit}` : "bez limitu"}{" "}
          <span className="text-muted-foreground">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${kolor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * PB-44 — zużycie zasobów usługi (limity LVE i ostatnie 24 h). Dane z bazy panelu (telemetria węzła),
 * odświeżane co 30 s. Błąd odczytu → komunikat; poprzednie dane zostają na ekranie.
 */
export function ZasobyPanel({ subscriptionId, poczatkowe }: { subscriptionId: string; poczatkowe: Wynik<ZuzycieUslugi> }) {
  const [wynik, setWynik] = useState(poczatkowe);
  const [dane, setDane] = useState<ZuzycieUslugi | null>(poczatkowe.ok ? poczatkowe.data : null);

  useEffect(() => {
    if (!poczatkowe.ok && poczatkowe.brakUprawnien) return;
    const id = setInterval(() => {
      void pobierzZuzycieAction(subscriptionId).then((r) => {
        setWynik(r);
        if (r.ok) setDane(r.data);
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [subscriptionId, poczatkowe]);

  const a = dane?.account;
  const l = dane?.latest;
  const wykres = dane?.rows.slice(-48) ?? [];

  return (
    <div className="space-y-3">
      {!wynik.ok ? <p className="text-sm text-rose-300">{wynik.error}</p> : null}
      {!dane ? null : !a ? (
        <p className="text-sm text-muted-foreground">Brak konta hostingowego — nie ma czego mierzyć.</p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {a.daUsername} · limit efektywny (plan + autoskalowanie)
            {l ? ` · pomiar ${new Date(l.bucketStart).toLocaleString("pl-PL")}` : " · brak pomiarów w ostatnich 24 h"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Pasek label="CPU" value={Math.round(l?.cpuUsageAvg ?? 0)} max={a.cpuLimit} unit="%" />
            <Pasek label="RAM" value={Math.round(l?.memUsageAvgMb ?? 0)} max={a.ramLimitMb} unit=" MB" />
            <Pasek label="Dysk" value={Math.round(l?.diskUsageMb ?? 0)} max={a.diskLimitMb} unit=" MB" />
            <Pasek label="I/O" value={Math.round(l?.ioUsageKbps ?? 0)} max={a.ioLimitKbps} unit=" KB/s" />
          </div>
          {a.scaledCpu > 0 || a.scaledRamMb > 0 || a.scaledDiskMb > 0 ? (
            <p className="text-[11px] text-cyan-200">
              Autoskalowanie aktywne: CPU +{a.scaledCpu}% · RAM +{a.scaledRamMb} MB · Dysk +{a.scaledDiskMb} MB
            </p>
          ) : null}
          {wykres.length > 0 ? (
            <div className="flex h-20 items-end gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-3" aria-label="CPU w ostatnich 24 h">
              {wykres.map((row) => (
                <div
                  key={row.bucketStart}
                  className="min-w-0.5 flex-1 rounded-t bg-cyan-400/70"
                  title={`${new Date(row.bucketStart).toLocaleString("pl-PL")}: CPU ${row.cpuUsageAvg}%`}
                  style={{ height: `${Math.max(3, Math.min(100, row.cpuUsageAvg))}%` }}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Loader2, Wrench, ShieldCheck, AlertTriangle } from "lucide-react";
import { setNodeMaintenance } from "../actions";

interface Props {
  serverId: string;
  status: string;
  maintenanceReason: string | null;
  maintenanceStartedAt: string | null;
}

export function MaintenanceToggle({
  serverId,
  status,
  maintenanceReason,
  maintenanceStartedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(maintenanceReason ?? "");

  const isMaintenance = status === "MAINTENANCE";
  const isActive = status === "ACTIVE";
  const canToggle = isActive || isMaintenance;

  const enable = () => {
    setError(null);
    if (!reason.trim()) {
      setError("Podaj powód maintenance — będzie widoczny w audicie i komunikacie dla klienta.");
      return;
    }
    startTransition(async () => {
      const res = await setNodeMaintenance(serverId, true, reason.trim());
      if (res.error) setError(res.error);
    });
  };
  const disable = () => {
    setError(null);
    startTransition(async () => {
      const res = await setNodeMaintenance(serverId, false);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Wrench className="h-4 w-4 text-amber-300" />
        Maintenance mode (A-08)
      </div>
      {!canToggle ? (
        <p className="text-xs text-muted-foreground">
          Maintenance mode można przełączać tylko z węzłów w statusie ACTIVE/MAINTENANCE.
          Aktualnie: <strong className="text-white">{status}</strong>.
        </p>
      ) : isMaintenance ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-3.5 w-3.5" /> Węzeł jest w trybie maintenance
            </div>
            {maintenanceReason ? (
              <div className="text-xs">
                <span className="text-amber-200/80">Powód:</span> {maintenanceReason}
              </div>
            ) : null}
            {maintenanceStartedAt ? (
              <div className="text-[11px] text-amber-200/70">
                od {new Date(maintenanceStartedAt).toLocaleString("pl-PL")}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={disable}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Wyłącz maintenance — przywróć ACTIVE
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Włączenie maintenance natychmiast blokuje NodeSelector dla tego węzła.
            Klient widzi komunikat z powodu (poniżej) zamiast generycznego błędu.
            Istniejące konta działają dalej, tylko nowe provisioningy są wstrzymane.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="np. wymiana dysków NVMe — okno 02:00–04:00"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={enable}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Włącz maintenance — zablokuj nowe provisioningi
          </button>
        </div>
      )}
      {error ? (
        <p className="text-xs text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}

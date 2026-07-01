"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Check, AlertCircle } from "lucide-react";
import { updateFleet } from "./actions";

/**
 * NODE-6 — aktualizacja całej floty do latest-stable (rolling). Zleca zadanie
 * FLEET_UPDATE na każdym węźle ACTIVE z agentem; agent każdego węzła wykona je
 * osobno (CustomBuild + yum). Potwierdzenie przed uruchomieniem.
 */
export function FleetUpdateButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    if (!confirm("Zlecić aktualizację stacku (DA/CloudLinux/LiteSpeed) na WSZYSTKICH aktywnych węzłach? Zalecane po drainie ruchu.")) {
      return;
    }
    setMsg(null);
    start(async () => {
      const { data, error } = await updateFleet();
      if (data) setMsg({ ok: true, text: `Zlecono na ${data.queued} węzłach (pominięto ${data.skipped}).` });
      else setMsg({ ok: false, text: error ?? "Błąd." });
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted-foreground hover:text-white disabled:opacity-50"
        title="Aktualizuj stack na całej flocie do najnowszej stabilnej wersji"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Aktualizuj flotę
      </button>
      {msg ? (
        <span className={`inline-flex items-center gap-1 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}

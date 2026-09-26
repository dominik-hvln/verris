"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Check, AlertCircle } from "lucide-react";
import { updateFleet } from "./actions";
import { potwierdz } from "@/components/potwierdz";

/**
 * NODE-6 — aktualizacja całej floty do latest-stable (rolling). Zleca zadanie
 * FLEET_UPDATE na każdym węźle ACTIVE z agentem; agent każdego węzła wykona je
 * osobno (CustomBuild + yum). Potwierdzenie przed uruchomieniem.
 */
export function FleetUpdateButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = async () => {
    if (!(await potwierdz("Uruchomić falę aktualizacji stacku (DA/CloudLinux/LiteSpeed)? Najpierw węzeł kanarkowy (najmniej kont), potem pozostałe po jednym — każdy następny dopiero po udanej aktualizacji poprzedniego, błąd zatrzymuje falę.", { akcja: 'Uruchom falę', niebezpieczne: true }))) {
      return;
    }
    setMsg(null);
    start(async () => {
      const { data, error } = await updateFleet();
      if (data) setMsg({ ok: true, text: data.queued ? `Fala ruszyła od węzła kanarkowego; pozostałe pójdą po kolei (pominięto bez agenta: ${data.skipped}).` : `Brak węzłów z agentem (pominięto ${data.skipped}).` });
      else setMsg({ ok: false, text: error ?? "Błąd." });
    });
  };

  return (
    <div className="flex flex-row-reverse items-center gap-2">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-line-strong bg-transparent px-3.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50"
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

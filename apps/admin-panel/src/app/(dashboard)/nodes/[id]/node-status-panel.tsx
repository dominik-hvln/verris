"use client";

import { useState, useTransition } from "react";
import { Loader2, PowerOff, Power } from "lucide-react";
import { potwierdz } from "@/components/potwierdz";
import { setNodeStatus } from "../actions";

/**
 * Węzeł, którego fizycznie już nie ma (albo wyłączony na dłużej), oznaczamy jako OFFLINE — wtedy
 * nie trafia do wyboru węzła przy zakładaniu konta ani do preflightu GO-LIVE. API dopuszcza
 * ACTIVE/MAINTENANCE → OFFLINE i OFFLINE → ACTIVE (reszta tylko przez handshake i „Zatwierdź”).
 */
export function NodeStatusPanel({ serverId, status }: { serverId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const offline = status === "OFFLINE";
  if (!offline && status !== "ACTIVE" && status !== "MAINTENANCE") return null;

  // Okno potwierdzenia PRZED transition: w React 19 aktualizacje z async transition czekają na jej koniec,
  // więc okno otwarte w środku nigdy się nie pokazuje, a przycisk kręci się bez końca.
  const zmien = async () => {
    setError(null);
    const ok = await potwierdz(
      offline
        ? "Przywrócić węzeł jako aktywny? Znów będzie wybierany przy zakładaniu kont."
        : "Oznaczyć węzeł jako offline? Nie będzie wybierany przy zakładaniu kont.",
      { akcja: offline ? "Przywróć" : "Oznacz jako offline", niebezpieczne: !offline },
    );
    if (!ok) return;
    start(async () => {
      const r = await setNodeStatus(serverId, offline ? "ACTIVE" : "OFFLINE");
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        {offline ? <PowerOff className="h-4 w-4 text-rose-300" /> : <Power className="h-4 w-4 text-emerald-300" />}
        Status węzła: {offline ? "offline" : status === "MAINTENANCE" ? "konserwacja" : "aktywny"}
      </div>
      <p className="text-xs text-muted-foreground">
        {offline
          ? "Węzeł jest wyłączony z użycia: nie zakłada się na nim kont i nie liczy się do gotowości startu."
          : "Gdy serwera już nie ma albo zostanie wyłączony na dłużej, oznacz go jako offline."}
      </p>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <button
        type="button"
        onClick={() => void zmien()}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {offline ? "Przywróć jako aktywny" : "Oznacz jako offline"}
      </button>
    </div>
  );
}

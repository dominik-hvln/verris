"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { PRZYCISK } from "@/components/v2";
import { potwierdz } from "@/components/potwierdz";
import { updateNode } from "../actions";

/** NODE-6 — aktualizacja stosu tylko tego węzła (akcja API istniała, nie było do niej przycisku). */
export function AktualizujWezelButton({ serverId }: { serverId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    if (!(await potwierdz("Zaktualizować stos tego węzła (DirectAdmin, CloudLinux, LiteSpeed) do najnowszych stabilnych wersji? Strony klientów działają w trakcie; część usług może się na chwilę zrestartować.", { akcja: "Aktualizuj węzeł", niebezpieczne: true }))) return;
    start(async () => {
      const r = await updateNode(serverId);
      setMsg(r.data ? { ok: true, text: "Zadanie aktualizacji w kolejce — postęp w zakładce Zadania." } : { ok: false, text: r.error ?? "Błąd." });
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void run()} disabled={pending} className={PRZYCISK}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Aktualizuj ten węzeł
      </button>
      {msg ? <span className={`text-sm ${msg.ok ? "text-data-hi" : "text-crit"}`}>{msg.text}</span> : null}
    </div>
  );
}

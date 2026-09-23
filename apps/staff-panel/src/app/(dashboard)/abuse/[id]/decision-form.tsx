"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decyzjaAction } from "../actions";

export function DecisionForm({ id, maKlienta }: { id: string; maKlienta: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState("");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (status: "IN_REVIEW" | "ACTION_TAKEN" | "REJECTED") =>
    start(async () => {
      const r = await decyzjaAction({ id, status, decision, notifyCustomer: status === "ACTION_TAKEN" && notify });
      if ("error" in r) return setMsg(r.error);
      setMsg("Zapisano.");
      router.refresh();
    });
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
      <h2 className="text-sm font-semibold text-white">Decyzja</h2>
      <p className="text-xs text-muted-foreground">
        Samo ograniczenie usługi (zawieszenie, kordon wysyłki, usunięcie pliku) robisz w panelu admina lub na węźle — tu zapisujesz decyzję i uzasadnienie.
      </p>
      <textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={5}
        placeholder="Uzasadnienie (min. 20 znaków): co sprawdziłeś, co zrobiłeś i na jakiej podstawie. Dostanie je zgłaszający."
        className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white" />
      {maKlienta ? (
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Przy „Podjęto działania” wyślij klientowi uzasadnienie (DSA art. 17)
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} onClick={() => run("IN_REVIEW")} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">Biorę do sprawdzenia</button>
        <button disabled={pending} onClick={() => run("ACTION_TAKEN")} className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50">Podjęto działania</button>
        <button disabled={pending} onClick={() => run("REJECTED")} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50">Odrzuć (bez podstaw)</button>
      </div>
      {msg ? <p className="text-xs text-neutral-300">{msg}</p> : null}
    </div>
  );
}

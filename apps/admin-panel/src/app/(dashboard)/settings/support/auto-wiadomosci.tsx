"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/checkbox";
import { zapiszAutoWiadomosc, type AutoWiadomosc, type WidokAuto } from "./actions";

function Karta({ w, zmienne }: { w: AutoWiadomosc; zmienne: string[] }) {
  const [wlaczone, setWlaczone] = useState(w.wlaczone);
  const [tresc, setTresc] = useState(w.tresc);
  const [info, setInfo] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();
  const zmiana = wlaczone !== w.wlaczone || tresc !== w.tresc;

  const zapisz = () =>
    start(async () => {
      const r = await zapiszAutoWiadomosc(w.rodzaj, { wlaczone, tresc });
      setInfo(r.ok ? { ok: true, tekst: "Zapisano — obowiązuje od następnego zgłoszenia." } : { ok: false, tekst: r.error });
    });

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby={`aw-${w.rodzaj}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={`aw-${w.rodzaj}`} className="text-base font-semibold">
            {w.nazwa}
          </h2>
          <p className="text-xs text-muted-foreground">{w.kiedy}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={wlaczone} onChange={(e) => setWlaczone(e.target.checked)} /> Włączona
        </label>
      </div>
      <label className="block text-xs text-neutral-400" htmlFor={`tr-${w.rodzaj}`}>
        Treść (zmienne: {zmienne.map((z) => `{{${z}}}`).join(", ")})
      </label>
      <textarea
        id={`tr-${w.rodzaj}`}
        value={tresc}
        onChange={(e) => setTresc(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={zapisz}
          disabled={pending || !zmiana || tresc.trim().length < 10}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz
        </button>
        {tresc !== w.domyslna ? (
          <button type="button" onClick={() => setTresc(w.domyslna)} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">
            Przywróć domyślną treść
          </button>
        ) : null}
        {info ? (
          <span role="status" className={`text-sm ${info.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {info.tekst}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** PB-37 — cztery automatyczne wiadomości: treść i włączenie, zapis osobno dla każdej. */
export function AutoWiadomosciEdytor({ widok }: { widok: WidokAuto }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {widok.wiadomosci.map((w) => (
        <Karta key={w.rodzaj} w={w} zmienne={widok.zmienne} />
      ))}
    </div>
  );
}

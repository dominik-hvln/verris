"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { PoleLiczby } from "@/components/pole-liczby";
import { Pomoc } from "@/components/pomoc";
import { zapiszProgiSla, type PriorytetSla, type ProgiSla, type WidokSla } from "./actions";

const PRIORYTETY: { k: PriorytetSla; nazwa: string }[] = [
  { k: "URGENT", nazwa: "Pilny" },
  { k: "HIGH", nazwa: "Wysoki" },
  { k: "NORMAL", nazwa: "Normalny" },
  { k: "LOW", nazwa: "Niski" },
];

const POLE = "w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400/60";

/** F3.7 (OE-25) — progi SLA per priorytet, godziny zegarowe (decyzja 06.10). Walidację robi API. */
export function ProgiSlaEdytor({ widok }: { widok: WidokSla }) {
  const [progi, setProgi] = useState<ProgiSla>(widok.progi);
  const [info, setInfo] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();
  const zmiana = JSON.stringify(progi) !== JSON.stringify(widok.progi);
  const ustaw = (rodzaj: keyof ProgiSla, k: PriorytetSla, n: number) =>
    setProgi((p) => ({ ...p, [rodzaj]: { ...p[rodzaj], [k]: Math.round(n) } }));
  const zapisz = () =>
    start(async () => {
      const r = await zapiszProgiSla(progi);
      setInfo(r.ok ? { ok: true, tekst: "Zapisano — obowiązuje dla nowych zgłoszeń i przy zmianie priorytetu." } : { ok: false, tekst: r.error });
    });

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-labelledby="sla-progi">
      <div className="flex items-center gap-2">
        <h2 id="sla-progi" className="text-base font-semibold">
          Terminy SLA
        </h2>
        <Pomoc id="sla-zgloszen" />
      </div>
      <p className="text-xs text-muted-foreground">Godziny zegarowe od utworzenia zgłoszenia, przez całą dobę.</p>
      <table className="v2-stack w-full max-w-xl text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-400">
            <th className="py-2 pr-3">Priorytet</th>
            <th className="py-2 pr-3">Pierwsza odpowiedź (h)</th>
            <th className="py-2">Rozwiązanie (h)</th>
          </tr>
        </thead>
        <tbody>
          {PRIORYTETY.map(({ k, nazwa }) => (
            <tr key={k} className="border-t border-white/10">
              <td data-label="Priorytet" className="py-2 pr-3 font-medium">{nazwa}</td>
              <td data-label="Pierwsza odpowiedź (h)" className="py-2 pr-3">
                <PoleLiczby aria-label={`${nazwa}: pierwsza odpowiedź w godzinach`} className={POLE} min={1} value={progi.odpowiedz[k]} onChange={(n) => ustaw("odpowiedz", k, n)} />
              </td>
              <td data-label="Rozwiązanie (h)" className="py-2">
                <PoleLiczby aria-label={`${nazwa}: rozwiązanie w godzinach`} className={POLE} min={1} value={progi.rozwiazanie[k]} onChange={(n) => ustaw("rozwiazanie", k, n)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={zapisz}
          disabled={pending || !zmiana}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz
        </button>
        {JSON.stringify(progi) !== JSON.stringify(widok.domyslne) ? (
          <button type="button" onClick={() => setProgi(widok.domyslne)} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">
            Przywróć domyślne
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

"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { pobierzPakietyFlotyAction, wyslijPakietyNaFloteAction, type PakietyFloty, type WynikSyncuFloty } from "../actions";

/**
 * Plan w panelu = pakiet DA na każdym węźle. Po zmianie limitów admin świadomie wysyła pakiety
 * na flotę — z podglądem, ile kont dostanie nowe limity od razu (decyzja 28.09: po potwierdzeniu).
 */
export function PakietyNaFlocie({ planId, slug }: { planId: string; slug: string }) {
  const [podglad, setPodglad] = useState<PakietyFloty | null>(null);
  const [wynik, setWynik] = useState<WynikSyncuFloty | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [potwierdz, setPotwierdz] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    void pobierzPakietyFlotyAction(planId).then((r) => (r.ok && r.dane ? setPodglad(r.dane) : setBlad(r.ok ? null : r.error)));
  }, [planId]);

  const wyslij = () =>
    start(async () => {
      setBlad(null);
      const r = await wyslijPakietyNaFloteAction();
      if (r.ok && r.dane) setWynik(r.dane);
      else if (!r.ok) setBlad(r.error);
      setPotwierdz(false);
    });

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="text-sm font-semibold text-white">Pakiet DirectAdmin na węzłach</h2>
      <p className="text-xs text-muted-foreground">
        Limity tego planu są wzorem pakietu <code className="text-white/80">{slug}</code> na każdym węźle. Nowe węzły dostają
        pakiety automatycznie po onboardzie. Po zmianie limitów wyślij je na flotę — dotychczasowe konta dostaną nowe
        limity od razu (dysk, transfer, CPU, RAM, IO, procesy).
      </p>
      {podglad ? (
        <p className="text-sm text-white">
          Konta tego planu: <strong>{podglad.konta}</strong> na{" "}
          {podglad.wezly.filter((w) => w.konta > 0).length} z {podglad.wezly.length} węzłów
          {podglad.wezly.some((w) => w.konta > 0) ? (
            <span className="text-muted-foreground">
              {" "}({podglad.wezly.filter((w) => w.konta > 0).map((w) => `${w.name}: ${w.konta}`).join(", ")})
            </span>
          ) : null}
        </p>
      ) : null}
      {!potwierdz ? (
        <button
          type="button"
          disabled={pending || !podglad || podglad.wezly.length === 0}
          onClick={() => setPotwierdz(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Wyślij pakiety na wszystkie węzły
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span>
            Nadpisze pakiety wszystkich aktywnych planów na {podglad?.wezly.length ?? 0} węzłach
            {podglad && podglad.konta > 0 ? ` i od razu zmieni limity ${podglad.konta} kont tego planu` : ""}. Na pewno?
          </span>
          <button type="button" onClick={wyslij} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1 font-semibold text-black disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Tak, wyślij
          </button>
          <button type="button" onClick={() => setPotwierdz(false)} className="text-amber-200 underline">Anuluj</button>
        </div>
      )}
      {wynik ? (
        <ul className="space-y-1 text-xs">
          {wynik.wyniki.map((w) => (
            <li key={w.id} className={w.ok ? "text-emerald-300" : "text-rose-300"}>
              {w.name}: {w.ok ? `zapisano (${(w.pakiety ?? []).join(", ")})` : w.blad}
            </li>
          ))}
        </ul>
      ) : null}
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
    </section>
  );
}

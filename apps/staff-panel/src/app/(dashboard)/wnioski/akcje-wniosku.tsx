"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { akceptujWniosekAction, anulujWniosekAction, odrzucWniosekAction } from "@/lib/wnioski-actions";

const PRZYCISK = "rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

type Wynik = { tekst: string; blad: boolean };

/** Komunikat po decyzji. FAILED = operacja NIE przeszła — kolor błędu, nie sukcesu. */
export function wynikDecyzji(w: { status: string; wynik?: { blad?: string; komunikat?: string } | null }): Wynik {
  if (w.status === "FAILED") return { tekst: `Nie wykonano: ${w.wynik?.blad ?? "błąd operacji"}`, blad: true };
  if (w.status === "REJECTED") return { tekst: "Odrzucono.", blad: false };
  return { tekst: w.wynik?.komunikat ?? "Zaakceptowano.", blad: false };
}

export function WynikDecyzji({ wynik }: { wynik: Wynik }) {
  return (
    <p className={`text-xs ${wynik.blad ? "text-rose-300" : "text-emerald-300"}`} role={wynik.blad ? "alert" : undefined}>
      {wynik.tekst}
    </p>
  );
}

/** PB-48 — akceptuj / odrzuć z powodem (powód wymagany — wnioskujący dostaje go w powiadomieniu). */
export function DecyzjaWniosku({ id }: { id: string }) {
  const router = useRouter();
  const [odrzucanie, setOdrzucanie] = useState(false);
  const [powod, setPowod] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<Wynik | null>(null);
  const [pending, start] = useTransition();

  const po = (r: Awaited<ReturnType<typeof akceptujWniosekAction>>) => {
    if (!r.ok) return setBlad(r.error);
    setWynik(wynikDecyzji(r.wniosek));
    router.refresh();
  };

  if (wynik) return <WynikDecyzji wynik={wynik} />;

  return (
    <div className="space-y-2" data-decyzja={id}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => po(await akceptujWniosekAction(id)))}
          className={`${PRZYCISK} border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25`}
        >
          {pending && !odrzucanie ? "Wykonuję…" : "Akceptuj i wykonaj"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOdrzucanie((v) => !v)}
          className={`${PRZYCISK} border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20`}
        >
          Odrzuć
        </button>
      </div>
      {odrzucanie ? (
        <div className="space-y-2">
          <textarea
            aria-label="Powód odrzucenia"
            rows={2}
            maxLength={1000}
            value={powod}
            onChange={(e) => setPowod(e.target.value)}
            placeholder="Powód odrzucenia (wymagany)"
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={pending || powod.trim().length < 3}
            onClick={() => start(async () => po(await odrzucWniosekAction(id, powod)))}
            className={`${PRZYCISK} border-rose-500/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25`}
          >
            {pending ? "Zapisuję…" : "Odrzuć wniosek"}
          </button>
        </div>
      ) : null}
      {blad ? <p className="text-xs text-rose-300">{blad}</p> : null}
    </div>
  );
}

/** Wycofanie własnego, nierozpatrzonego wniosku. */
export function WycofajWniosek({ id }: { id: string }) {
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await anulujWniosekAction(id);
            if (r.ok) router.refresh();
            else setBlad(r.error);
          })
        }
        className={`${PRZYCISK} border-white/15 bg-white/5 text-neutral-200 hover:bg-white/10`}
      >
        {pending ? "Wycofuję…" : "Wycofaj"}
      </button>
      {blad ? <span className="text-xs text-rose-300">{blad}</span> : null}
    </span>
  );
}

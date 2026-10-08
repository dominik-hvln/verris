"use client";

import { useState, useTransition } from "react";
import { zapiszNotatkeAction } from "./operacje-actions";

/**
 * PB-46 — notatka wewnętrzna (to samo pole co w panelu admina). Podgląd z CUSTOMERS_VIEW, edycja tylko
 * z CUSTOMERS_MANAGE — bez uprawnienia pokazujemy sam tekst, bez pola i przycisku.
 */
export function NotatkaWewnetrzna({ userId, poczatkowa, mozeEdytowac }: { userId: string; poczatkowa: string; mozeEdytowac: boolean }) {
  const [tekst, setTekst] = useState(poczatkowa);
  const [zapisana, setZapisana] = useState(poczatkowa);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!mozeEdytowac) {
    return poczatkowa.trim() ? (
      <p className="whitespace-pre-wrap text-sm text-neutral-200">{poczatkowa}</p>
    ) : (
      <p className="text-xs text-muted-foreground">Brak notatki.</p>
    );
  }

  const zapisz = () =>
    start(async () => {
      const r = await zapiszNotatkeAction(userId, tekst);
      if (r.ok) {
        setZapisana(tekst);
        setBlad(null);
      } else setBlad(r.error);
    });

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Widzi tylko zespół Verris</span>
        <textarea
          rows={3}
          value={tekst}
          maxLength={4000}
          onChange={(e) => setTekst(e.target.value)}
          className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
        />
      </label>
      {tekst !== zapisana || blad ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={zapisz}
            disabled={pending}
            className="rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {pending ? "Zapisuję…" : "Zapisz notatkę"}
          </button>
          {blad ? <span className="text-xs text-rose-300">{blad}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { PRZYCISK } from "@/components/v2";
import { patchCustomerOperationalAction } from "../actions";

/** PB-34 — notatka widoczna tylko dla zespołu (to samo pole co w „Dostępy i bezpieczeństwo”). */
export function NotatkaWewnetrzna({ userId, poczatkowa }: { userId: string; poczatkowa: string }) {
  const [tekst, setTekst] = useState(poczatkowa);
  const [zapisana, setZapisana] = useState(poczatkowa);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const zapisz = () =>
    start(async () => {
      const r = await patchCustomerOperationalAction(userId, { adminInternalNote: tekst.trim() || null });
      if (r.ok) {
        setZapisana(tekst);
        setBlad(null);
      } else setBlad(r.error);
    });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Widzi tylko zespół Verris</span>
        <textarea
          rows={3}
          value={tekst}
          maxLength={4000}
          onChange={(e) => setTekst(e.target.value)}
          className="resize-y rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      {tekst !== zapisana || blad ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={zapisz} disabled={pending} className={`${PRZYCISK} !h-8 !text-[13px]`}>
            {pending ? "Zapisuję…" : "Zapisz notatkę"}
          </button>
          {blad ? <span className="text-[13px] text-crit">{blad}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

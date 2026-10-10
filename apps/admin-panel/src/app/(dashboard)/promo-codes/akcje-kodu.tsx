"use client";

import { useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { PoleDaty } from "@/components/pole-daty";
import { updatePromoAction } from "./actions";
import type { PromoCodeRow } from "./data";
import { doPolaDaty, zbudujZmiane } from "./zmiana-kodu";

const POLE = "mt-1 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none";

/** B1 — „Wyłącz”/„Włącz” i edycja terminu, limitu i opisu kodu na liście. */
export function AkcjeKodu({ row }: { row: PromoCodeRow }) {
  const [pending, start] = useTransition();
  const [edycja, setEdycja] = useState(false);
  const [validTo, setValidTo] = useState(doPolaDaty(row.validTo));
  const [limit, setLimit] = useState(row.maxRedemptions == null ? "" : String(row.maxRedemptions));
  const [opis, setOpis] = useState(row.description ?? "");
  const [blad, setBlad] = useState<string | null>(null);

  const przelacz = async () => {
    if (row.active) {
      const ok = await potwierdz(`Wyłączyć kod ${row.code}? Nie zadziała przy zakupie ani przy kolejnych odnowieniach. Dotychczasowe użycia zostają.`, { akcja: "Wyłącz", niebezpieczne: true });
      if (!ok) return;
    }
    start(async () => {
      const r = await updatePromoAction(row.id, { active: !row.active });
      if (!r.ok) await potwierdz(r.error ?? "Nieznany błąd.", { akcja: "OK", tytul: "Nie udało się" });
    });
  };

  const zapisz = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBlad(null);
    const z = zbudujZmiane(row, { validTo, maxRedemptions: limit, description: opis });
    if (!z.ok) {
      setBlad(z.blad);
      return;
    }
    start(async () => {
      const r = await updatePromoAction(row.id, z.zmiana);
      if (!r.ok) setBlad(r.error ?? "Nieznany błąd.");
      else setEdycja(false);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void przelacz()}
          disabled={pending}
          className={
            row.active
              ? "rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
              : "rounded-lg border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
          }
        >
          {row.active ? "Wyłącz" : "Włącz"}
        </button>
        <button
          type="button"
          onClick={() => setEdycja((v) => !v)}
          disabled={pending}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-50"
        >
          {edycja ? "Anuluj" : "Edytuj"}
        </button>
      </div>
      {edycja ? (
        <form onSubmit={zapisz} className="w-64 space-y-2 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
          <label className="block text-muted-foreground" htmlFor={`kod-${row.id}-do`}>
            Ważny do (puste = bezterminowo)
            <PoleDaty zGodzina id={`kod-${row.id}-do`} value={validTo} onChange={setValidTo} className={POLE} />
          </label>
          <label className="block text-muted-foreground">
            Limit użyć (puste = bez limitu)
            <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} className={POLE} />
          </label>
          <label className="block text-muted-foreground">
            Opis
            <input value={opis} onChange={(e) => setOpis(e.target.value)} maxLength={500} className={POLE} />
          </label>
          {blad ? <p className="text-rose-300">{blad}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            Zapisz
          </button>
        </form>
      ) : null}
    </div>
  );
}

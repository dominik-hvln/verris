"use client";

import { useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Checkbox } from "@/components/checkbox";
import { odrzucZgloszenieAction, zaprosZgloszenieAction, type ZgloszenieRow } from "./actions";

/** Otwarta beta — przyciski decyzji przy zgłoszeniu z verris.pl/beta (opisy wierszy: ./zgloszenia-opisy). */
export function DecyzjaZgloszenia({ z }: { z: Pick<ZgloszenieRow, "id" | "imie" | "email" | "status" | "potwierdzone"> }) {
  const [pending, start] = useTransition();
  const [powiadom, setPowiadom] = useState(true);
  const [wynik, setWynik] = useState<string | null>(null);

  if (z.status === "ZAPROSZONE" || z.status === "ODRZUCONE") return null;

  const zapros = async () => {
    if (!(await potwierdz(`Wysłać zaproszenie z kodem 150 K do ${z.imie} (${z.email})?`, { akcja: "Zaproś" }))) return;
    start(async () => {
      const r = await zaprosZgloszenieAction(z.id);
      if (!r.ok) return void (await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" }));
      setWynik(r.mailWyslany ? `Wysłane — kod ${r.code}.` : `Kod ${r.code} utworzony, mail nie wyszedł — przekaż go osobiście.`);
    });
  };

  const odrzuc = async () => {
    const tresc = powiadom && z.potwierdzone ? `Odrzucić zgłoszenie ${z.email} i wysłać uprzejmą wiadomość?` : `Odrzucić zgłoszenie ${z.email} bez wiadomości?`;
    if (!(await potwierdz(tresc, { akcja: "Odrzuć", niebezpieczne: true }))) return;
    start(async () => {
      const r = await odrzucZgloszenieAction(z.id, powiadom);
      if (!r.ok) await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" });
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5" data-decyzja-zgloszenia={z.id}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void zapros()}
          disabled={pending || z.status !== "NOWE"}
          title={z.status === "NOWE" ? undefined : "Adres nie jest jeszcze potwierdzony"}
          className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40"
        >
          Zaproś
        </button>
        <button
          type="button"
          onClick={() => void odrzuc()}
          disabled={pending}
          className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
        >
          Odrzuć
        </button>
      </div>
      {z.potwierdzone ? (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox checked={powiadom} onChange={(e) => setPowiadom(e.target.checked)} />
          wyślij uprzejmą wiadomość przy odrzuceniu
        </label>
      ) : null}
      {wynik ? <p className="text-[11px] text-emerald-200">{wynik}</p> : null}
    </div>
  );
}

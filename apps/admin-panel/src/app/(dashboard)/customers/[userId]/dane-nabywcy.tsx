"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { potwierdz } from "@/components/potwierdz";
import { PRZYCISK } from "@/components/v2";
import { zmienDaneNabywcyAction } from "../actions";

/**
 * Fala 1B — działanie „Dane nabywcy” (PATCH /admin/billing/nabywcy/:userId/vat/dane, BILLING_MANAGE). API przyjmuje
 * kraj i NIP / numer VAT-UE; nazwę firmy i adres zmienia klient w swoim profilu. Zmiana zeruje weryfikację VAT
 * nabywcy i trafia do dziennika z powodem. Bez uprawnienia — pola tylko do odczytu i wyszarzony przycisk.
 */
export function DaneNabywcy({ userId, kraj, nip, zablokowane }: { userId: string; kraj: string; nip: string | null; zablokowane: string | null }) {
  const router = useRouter();
  const [k, setK] = useState(kraj);
  const [n, setN] = useState(nip ?? "");
  const [powod, setPowod] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const zmiana = k.trim().toUpperCase() !== kraj || n.trim() !== (nip ?? "");
  const gotowy = zmiana && powod.trim().length >= 5 && !zablokowane;
  const pole = "w-full rounded-[9px] border border-line-strong bg-transparent px-3 py-2 text-sm text-foreground disabled:opacity-60";

  const zapisz = async () => {
    const opis = `Kraj ${kraj} → ${k.trim().toUpperCase()}, NIP ${nip || "brak"} → ${n.trim() || "brak"}. Weryfikacja VAT nabywcy zostanie wyzerowana.`;
    if (!(await potwierdz(opis, { tytul: "Zmienić dane nabywcy?", akcja: "Zmień dane" }))) return;
    setBlad(null);
    start(async () => {
      const r = await zmienDaneNabywcyAction(userId, { kraj: k, nip: n, powod });
      if (r.ok) {
        setPowod("");
        router.refresh();
      } else setBlad(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2.5">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Kraj
          <input value={k} onChange={(e) => setK(e.target.value)} maxLength={2} disabled={!!zablokowane} className={`${pole} font-mono uppercase`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          NIP / numer VAT-UE
          <input value={n} onChange={(e) => setN(e.target.value)} maxLength={20} disabled={!!zablokowane} className={`${pole} font-mono`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Powód zmiany (trafia do dziennika)
        <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={!!zablokowane} placeholder="np. zgłoszenie #1234" className={pole} />
      </label>
      {zablokowane ? (
        <span aria-disabled="true" title={zablokowane} className={`${PRZYCISK} cursor-not-allowed self-start opacity-50`}>
          Zmień dane nabywcy<span className="sr-only"> — {zablokowane}</span>
        </span>
      ) : (
        <button type="button" disabled={pending || !gotowy} onClick={() => void zapisz()} className={`${PRZYCISK} self-start`}>
          {pending ? "Zapisuję…" : "Zmień dane nabywcy"}
        </button>
      )}
      <p className="text-xs text-muted-foreground">Nazwę firmy i adres klient zmienia w swoim profilu.</p>
      {blad ? <p className="text-xs text-crit">{blad}</p> : null}
    </div>
  );
}

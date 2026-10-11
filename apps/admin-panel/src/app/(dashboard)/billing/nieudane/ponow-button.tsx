"use client";

import { useTransition } from "react";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { ponowAutoDoladowanieAction } from "../rozliczenia-actions";

const MIN_POWOD = 10;

/**
 * F3.6 — ponowienie nieudanego auto-doładowania: obciąża zapisaną kartę klienta kwotą z jego reguły. Powód do
 * dziennika (D2); błąd karty wraca jako błąd, nie „zlecono”.
 */
export function PonowButton({ userId, kwota }: { userId: string; kwota: string | null }) {
  const [pending, start] = useTransition();
  const click = async () => {
    const powod = await zapytaj(`Powód ponowienia do dziennika (min. ${MIN_POWOD} znaków):`, { akcja: "Dalej", tytul: "Ponów auto-doładowanie", placeholder: "np. klient zasilił kartę — zgłoszenie #ab12cd34" });
    if (powod === null) return;
    if (powod.trim().length < MIN_POWOD) {
      await potwierdz(`Powód musi mieć co najmniej ${MIN_POWOD} znaków.`, { akcja: "OK", tytul: "Za krótki powód" });
      return;
    }
    const ok = await potwierdz(`Obciążyć zapisaną kartę klienta kwotą ${kwota ?? "z jego reguły"} zł? Po potwierdzeniu od operatora kart portfel zostanie uznany.`, { akcja: "Obciąż kartę" });
    if (!ok) return;
    start(async () => {
      const r = await ponowAutoDoladowanieAction(userId, powod.trim()).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      await potwierdz(r.ok ? r.komunikat : r.error, { akcja: "OK", tytul: r.ok ? "Płatność zlecona" : "Nie udało się" });
    });
  };
  return (
    <button
      type="button"
      data-akcja="ponow"
      onClick={() => void click()}
      disabled={pending}
      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50"
    >
      {pending ? "Ponawiam…" : "Ponów"}
    </button>
  );
}

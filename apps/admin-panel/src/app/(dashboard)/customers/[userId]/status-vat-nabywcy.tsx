"use client";

import { useTransition } from "react";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { cofnijWeryfikacjeVatAction, weryfikacjaVatAction } from "../actions";
import type { StatusVatNabywcy } from "./status-vat-opis";

/**
 * Decyzja 09.10 — „Zweryfikuj status VAT nabywcy”: klient spoza UE dostaje cenę netto dopiero po weryfikacji
 * obsługi (kwalifikację potwierdza księgowa). Przycisk widzi tylko operator, któremu API zwróciło status
 * (BILLING_VIEW); zapis wymaga BILLING_MANAGE — bez niego API odmówi i pokażemy komunikat.
 */
export function StatusVatNabywcyAkcje({ userId, status }: { userId: string; status: StatusVatNabywcy }) {
  const [pending, start] = useTransition();
  if (!status.pozaUe) return null;

  const zweryfikuj = async () => {
    const podstawa = await zapytaj(
      `Na jakiej podstawie nabywca z ${status.kraj} jest podmiotem spoza UE rozliczanym bez polskiego VAT? (dokument / rejestr / kto z księgowości potwierdził)`,
      { tytul: "Zweryfikuj status VAT nabywcy", akcja: "Dalej", placeholder: "np. rejestr handlowy CH, UID CHE-…, potwierdzone przez księgową 09.10" },
    );
    if (podstawa === null) return;
    const ok = await potwierdz(
      "Od następnej płatności klient zapłaci cenę netto (dokument „np”, 1 zł = 1,23 K). Wpis trafi do dziennika z Twoim nazwiskiem i podstawą.",
      { akcja: "Zweryfikuj" },
    );
    if (!ok) return;
    start(async () => {
      const r = await weryfikacjaVatAction(userId, podstawa);
      if (!r.ok) await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" });
    });
  };

  const cofnij = async () => {
    const powod = await zapytaj("Powód cofnięcia weryfikacji (od następnej płatności 23% VAT):", { tytul: "Cofnij weryfikację VAT", akcja: "Cofnij" });
    if (powod === null) return;
    start(async () => {
      const r = await cofnijWeryfikacjeVatAction(userId, powod);
      if (!r.ok) await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" });
    });
  };

  const cls = "rounded-md border border-white/15 px-2 py-0.5 text-[11.5px] font-semibold hover:bg-white/5 disabled:opacity-50";
  return status.weryfikacja?.aktualna ? (
    <button type="button" onClick={() => void cofnij()} disabled={pending} className={cls} data-akcja="cofnij-weryfikacje-vat">
      Cofnij weryfikację VAT
    </button>
  ) : (
    <button type="button" onClick={() => void zweryfikuj()} disabled={pending} className={cls} data-akcja="zweryfikuj-vat">
      Zweryfikuj status VAT nabywcy
    </button>
  );
}

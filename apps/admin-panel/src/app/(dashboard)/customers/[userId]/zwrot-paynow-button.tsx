"use client";

import { useTransition } from "react";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { zwrotPaynowAction } from "../actions";

/** 2026-10-05 — zwrot doładowania opłaconego przez Paynow (pieniądze do klienta, K z portfela). */
export function ZwrotPaynowButton({ userId, walletTxId }: { userId: string; walletTxId: string }) {
  const [pending, start] = useTransition();
  const click = async () => {
    const kwota = await zapytaj("Kwota zwrotu w zł (puste = cała pozostała kwota wpłaty):", {
      akcja: "Dalej",
      tytul: "Zwrot przez Paynow",
      placeholder: "np. 20,00",
    });
    if (kwota === null) return;
    const opis = kwota.trim() ? `${kwota.trim()} zł` : "całą pozostałą kwotę";
    const ok = await potwierdz(
      `Zwrócić klientowi ${opis} przez Paynow? Pieniądze wrócą na jego konto, a z portfela zejdzie proporcjonalna część kredytów (nie poniżej zera). Pamiętaj o korekcie dokumentu.`,
      { akcja: "Zwróć", niebezpieczne: true },
    );
    if (!ok) return;
    start(async () => {
      const r = await zwrotPaynowAction(userId, walletTxId, kwota);
      await potwierdz(r.ok ? `Zlecono zwrot ${r.kwota} zł (status Paynow: ${r.status}).` : r.error, {
        akcja: "OK",
        tytul: r.ok ? "Zwrot zlecony" : "Nie udało się",
      });
    });
  };
  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={pending}
      className="rounded-md border border-rose-500/30 px-2 py-0.5 text-[11.5px] font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
    >
      Zwróć
    </button>
  );
}

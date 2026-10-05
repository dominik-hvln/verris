"use client";

import { useTransition } from "react";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { zwrotPaynowAction } from "../actions";

/**
 * 2026-10-05 — zwrot doładowania opłaconego przez Paynow (pieniądze do klienta, K z portfela).
 * „Zwrot zrobiony w Paynow”: zwrot wykonany ręcznie w panelu Paynow — API go nie zgłasza, więc tylko cofamy K.
 */
export function ZwrotPaynowButton({ userId, walletTxId }: { userId: string; walletTxId: string }) {
  const [pending, start] = useTransition();
  const click = async (wPanelu: boolean) => {
    const kwota = await zapytaj(wPanelu ? "Kwota zwrotu wykonanego w panelu Paynow, w zł (puste = cała pozostała kwota wpłaty):" : "Kwota zwrotu w zł (puste = cała pozostała kwota wpłaty):", {
      akcja: "Dalej",
      tytul: wPanelu ? "Zwrot zrobiony w Paynow" : "Zwrot przez Paynow",
      placeholder: "np. 20,00",
    });
    if (kwota === null) return;
    const opis = kwota.trim() ? `${kwota.trim()} zł` : "całą pozostałą kwotę";
    const ok = await potwierdz(
      wPanelu
        ? `Zapisać zwrot ${opis}, który wykonałeś już w panelu Paynow? Verris nie zleci drugiego zwrotu — z portfela zejdzie tylko proporcjonalna część kredytów (nie poniżej zera). Pamiętaj o korekcie dokumentu.`
        : `Zwrócić klientowi ${opis} przez Paynow? Pieniądze wrócą na jego konto, a z portfela zejdzie proporcjonalna część kredytów (nie poniżej zera). Pamiętaj o korekcie dokumentu.`,
      { akcja: wPanelu ? "Zapisz zwrot" : "Zwróć", niebezpieczne: true },
    );
    if (!ok) return;
    start(async () => {
      const r = await zwrotPaynowAction(userId, walletTxId, kwota, wPanelu);
      await potwierdz(r.ok ? (wPanelu ? `Zapisano zwrot ${r.kwota} zł z panelu Paynow.` : `Zlecono zwrot ${r.kwota} zł (status Paynow: ${r.status}).`) : r.error, {
        akcja: "OK",
        tytul: r.ok ? (wPanelu ? "Zwrot zapisany" : "Zwrot zlecony") : "Nie udało się",
      });
    });
  };
  const cls = "rounded-md border border-rose-500/30 px-2 py-0.5 text-[11.5px] font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50";
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={() => void click(false)} disabled={pending} className={cls}>
        Zwróć
      </button>
      <button type="button" onClick={() => void click(true)} disabled={pending} className={cls} title="Zwrot wykonany ręcznie w panelu Paynow — Verris tylko cofnie kredyty">
        Zwrot zrobiony w Paynow
      </button>
    </span>
  );
}

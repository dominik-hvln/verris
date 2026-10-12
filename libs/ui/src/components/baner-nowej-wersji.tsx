"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { nasluchujNowejWersji } from "../lib/po-wdrozeniu";

/**
 * „Jest nowa wersja panelu” — karta otwarta przed wdrożeniem woła akcję serwera, której już nie ma
 * (nasluchujNowejWersji). Nic nie przeładowuje się samo: użytkownik kończy, co robi, i klika „Odśwież”.
 * Zamknięty baner wraca przy kolejnym takim błędzie. Wygląd jak baner awarii panelu klienta (bursztynowy, ton „drobny”).
 * Klasy Tailwinda: plik jest w `@source` w globals.css każdego panelu (libs/ui leży poza katalogiem aplikacji).
 * Region aria-live jest w DOM zawsze — treść wstawiona później zostaje odczytana przez czytnik ekranu.
 */
export function BanerNowejWersji() {
  const [widoczny, ustawWidoczny] = useState(false);
  useEffect(() => nasluchujNowejWersji(window, () => ustawWidoczny(true)), []);
  return (
    <div
      role="status"
      aria-live="polite"
      data-baner-nowej-wersji
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4"
    >
      {widoczny ? (
        <div className="pointer-events-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black shadow-lg">
          <span className="min-w-0 flex-1 break-words">
            Jest nowa wersja panelu. Odśwież stronę, żeby dalej działała poprawnie.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 rounded-md bg-black/10 px-2.5 py-1 text-xs font-bold hover:bg-black/20"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              Odśwież
            </button>
            <button
              type="button"
              onClick={() => ustawWidoczny(false)}
              className="rounded-md bg-black/10 p-1 hover:bg-black/20"
              aria-label="Zamknij komunikat"
              title="Zamknij komunikat"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

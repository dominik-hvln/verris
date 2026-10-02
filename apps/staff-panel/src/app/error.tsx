"use client";

import { useOdswiezPoWdrozeniu } from "@verris/ui";

/**
 * Granica błędu dla stron poza głównym widokiem (logowanie, zaproszenia). Bez niej formularz otwarty
 * przed wdrożeniem kończył się surowym „Server Action … was not found” (D3 02.10, logowanie) — hook
 * przeładowuje stronę raz, gdy to tylko nieaktualna wersja po deployu.
 */
export default function BladStrony({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useOdswiezPoWdrozeniu(error);
  return (
    <div
      role="alert"
      className="mx-auto mt-16 max-w-xl space-y-4 rounded-2xl border border-white/15 p-6"
    >
      <h1 className="text-xl font-semibold">
        Nie udało się wczytać tej strony
      </h1>
      <p className="text-sm opacity-80">
        Spróbuj ponownie za chwilę.
        {error.digest ? (
          <>
            {" "}
            Kod błędu: <span className="font-mono">{error.digest}</span>.
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10"
      >
        Spróbuj ponownie
      </button>
    </div>
  );
}

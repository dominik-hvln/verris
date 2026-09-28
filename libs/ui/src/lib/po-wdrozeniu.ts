import { useEffect } from "react";

/**
 * Po wdrożeniu karta otwarta na starej wersji panelu ma nieaktualne ID akcji serwera i nazwy chunków —
 * pierwsza akcja kończy się ekranem „Nie udało się wczytać tej strony” (test D3, 29.09: usunięcie
 * rekordu DNS w trakcie deployu). To nie błąd użytkownika ani serwera: wystarczy przeładować stronę.
 */
export function czyNieaktualnaWersja(e: unknown): boolean {
  const err = e as { name?: unknown; message?: unknown } | null;
  const nazwa = String(err?.name ?? "");
  const tresc = String(err?.message ?? "");
  return (
    nazwa === "UnrecognizedActionError" ||
    nazwa === "ChunkLoadError" ||
    /Server Action "[^"]*" was not found/.test(tresc) ||
    /Loading chunk [\w-]+ failed|Failed to load chunk/i.test(tresc)
  );
}

/** Jednorazowe przeładowanie (najwyżej raz na minutę — bez pętli, gdy przyczyna jest inna). */
export function useOdswiezPoWdrozeniu(error: unknown): void {
  useEffect(() => {
    if (!czyNieaktualnaWersja(error)) return;
    const klucz = "verris-odswiez-po-wdrozeniu";
    try {
      if (Date.now() - Number(sessionStorage.getItem(klucz) ?? 0) < 60_000) return;
      sessionStorage.setItem(klucz, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);
}

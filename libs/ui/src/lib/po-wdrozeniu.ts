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

/**
 * Jednorazowe przeładowanie (najwyżej raz na minutę — bez pętli, gdy przyczyna jest inna).
 * Zwraca true, gdy przeładowanie ruszyło — wołający nie pokazuje wtedy surowego błędu. Dla formularzy,
 * które łapią wyjątki same (np. passkey: D3 06.10 po wylogowaniu z bezczynności i deployu pokazywał
 * „Server Action … was not found” zamiast się odświeżyć).
 */
export function odswiezPoWdrozeniu(error: unknown): boolean {
  if (!czyNieaktualnaWersja(error)) return false;
  const klucz = "verris-odswiez-po-wdrozeniu";
  try {
    if (Date.now() - Number(sessionStorage.getItem(klucz) ?? 0) < 60_000) return false;
    sessionStorage.setItem(klucz, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** To samo dla granic błędów (error.tsx). */
export function useOdswiezPoWdrozeniu(error: unknown): void {
  useEffect(() => {
    odswiezPoWdrozeniu(error);
  }, [error]);
}

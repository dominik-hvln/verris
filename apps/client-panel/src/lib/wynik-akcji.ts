import { unstable_rethrow } from "next/navigation";

/**
 * Błąd rzucony z akcji serwera Next na produkcji zamienia w „Minified React error #441” — klient
 * nie dostaje komunikatu API („Za mało środków w portfelu”, „Plik już istnieje”). Akcja zwraca
 * więc wynik z błędem, a klient `odpakuj` rzuca go ponownie już po swojej stronie, z treścią.
 */
export type Wynik<T> = { ok: true; dane: T } | { ok: false; blad: string };

/** Po stronie serwera: owija ciało akcji. redirect()/notFound() przechodzą dalej. */
export async function bezpiecznie<T>(fn: () => Promise<T>): Promise<Wynik<T>> {
  try {
    return { ok: true, dane: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, blad: e instanceof Error && e.message ? e.message : "Operacja nie powiodła się." };
  }
}

/** Po stronie klienta: dane albo Error z komunikatem z serwera. */
export function odpakuj<T>(w: Wynik<T>): T {
  if (w.ok) return w.dane;
  throw new Error(w.blad);
}

/** Akcja zwracająca Wynik → funkcja zwracająca dane (rzuca z komunikatem), bez zmian w wywołaniach. */
export function zOdpakowaniem<A extends unknown[], T>(akcja: (...a: A) => Promise<Wynik<T>>) {
  return async (...a: A): Promise<T> => odpakuj(await akcja(...a));
}

import { DOMYSLNY_POWROT, sciezkaPowrotu } from "./sciezka-powrotu";

/**
 * P4-4 / P3-11 (beta 3.11): cel z verris.pl („Załóż firmową pocztę” → /register?next=/dashboard/services/new?type=email,
 * „Zostań partnerem” → …/reseller) przeżywa rejestrację i potwierdzenie e-maila. Rejestracja zapisuje go w ciasteczku
 * (tylko ścieżka /dashboard…, sprawdzona przez sciezkaPowrotu), pierwsze logowanie — hasłem, 2FA albo w middleware przy
 * istniejącej sesji — prowadzi tam i ciasteczko kasuje. Ciasteczko niezbędne (cel, o który prosi klient), 7 dni, httpOnly.
 */
export const CIASTKO_CELU = "verris_cel";
export const CEL_WAZNY_S = 7 * 24 * 60 * 60;

type Sloik = {
  get(nazwa: string): { value: string } | undefined;
  set(nazwa: string, wartosc: string, opcje: Record<string, unknown>): unknown;
  delete(nazwa: string): unknown;
};

/** Zapisuje cel po rejestracji; domyślny pulpit albo niebezpieczna ścieżka — nic nie zapisuje. */
export function zapamietajCel(sloik: Sloik, next: unknown, produkcja = process.env.NODE_ENV === "production"): void {
  const cel = sciezkaPowrotu(next);
  if (cel === DOMYSLNY_POWROT) return;
  sloik.set(CIASTKO_CELU, cel, { httpOnly: true, sameSite: "lax", secure: produkcja, path: "/", maxAge: CEL_WAZNY_S });
}

/** Dokąd po zalogowaniu: jawny `next` wygrywa, inaczej cel z rejestracji. Ciasteczko zawsze kasujemy (jednorazowe). */
export function celPoZalogowaniu(sloik: Sloik, next: string): string {
  const zapisany = sloik.get(CIASTKO_CELU)?.value;
  if (zapisany === undefined) return next;
  sloik.delete(CIASTKO_CELU);
  return next !== DOMYSLNY_POWROT ? next : sciezkaPowrotu(zapisany);
}

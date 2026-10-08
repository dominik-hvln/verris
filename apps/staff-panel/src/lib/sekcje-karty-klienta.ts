/**
 * PB-46 (decyzja 08.10) — jedna karta klienta w panelu obsługi i w panelu admina: te same zakładki i te same
 * karty w tej samej kolejności, różnią się tylko uprawnieniami.
 *
 * Ten plik jest IDENTYCZNY w apps/staff-panel/src/lib i apps/admin-panel/src/lib (aplikacje nie importują
 * od siebie nawzajem) — pilnuje tego test `karta-klienta-parytet.spec.ts` w panelu obsługi. Zmieniasz układ
 * karty → zmień oba pliki i obie strony.
 */

export const SEKCJE_KARTY_KLIENTA = ["przeglad", "uslugi", "rozliczenia", "warunki", "zgloszenia", "dostepy", "dziennik"] as const;
export type SekcjaKartyKlienta = (typeof SEKCJE_KARTY_KLIENTA)[number];

/** Karty (atrybut `data-karta`) w kolejności, w jakiej stoją w DOM danej zakładki — przy pełnych uprawnieniach. */
export const KARTY_SEKCJI: Record<SekcjaKartyKlienta, readonly string[]> = {
  przeglad: ["uslugi", "os-czasu", "ryzyko", "rozliczenie", "notatka", "operacje"],
  uslugi: ["uslugi", "domeny", "dns-tls"],
  rozliczenia: ["portfel", "faktury", "metody"],
  warunki: ["warunki"],
  zgloszenia: ["zgloszenia"],
  dostepy: ["dostep", "blokada", "email", "reset", "usuniecie"],
  dziennik: ["dziennik"],
};

/** Operacje tylko dla administratora — panel obsługi ich nie pokazuje (API i tak odmawia STAFF). */
export const KARTY_TYLKO_ADMIN: readonly string[] = ["email", "reset", "usuniecie"];

export function sekcjaKarty(z: string | undefined): SekcjaKartyKlienta {
  return (SEKCJE_KARTY_KLIENTA as readonly string[]).includes(z ?? "") ? (z as SekcjaKartyKlienta) : "przeglad";
}

/** Pozycje zakładek; „Warunki indywidualne” tylko gdy API je oddało (403 = brak uprawnienia). */
export function zakladkiKartyKlienta(
  baza: string,
  aktywna: SekcjaKartyKlienta,
  o: { uslugi: number; zgloszenia: number; warunki: boolean },
): { klucz: SekcjaKartyKlienta; nazwa: string; href: string; on: boolean }[] {
  const nazwy: Record<SekcjaKartyKlienta, string> = {
    przeglad: "Przegląd",
    uslugi: `Usługi (${o.uslugi})`,
    rozliczenia: "Rozliczenia",
    warunki: "Warunki indywidualne",
    zgloszenia: `Zgłoszenia (${o.zgloszenia})`,
    dostepy: "Dostępy i bezpieczeństwo",
    dziennik: "Dziennik",
  };
  return SEKCJE_KARTY_KLIENTA.filter((s) => s !== "warunki" || o.warunki).map((s) => ({
    klucz: s,
    nazwa: nazwy[s],
    href: s === "przeglad" ? baza : `${baza}?sekcja=${s}`,
    on: s === aktywna,
  }));
}

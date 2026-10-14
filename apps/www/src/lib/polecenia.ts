/**
 * Program poleceń — warunki pokazywane na /polecaj. Źródło prawdy: domyślne ustawienia platformy w API
 * (`apps/api/src/platform-settings/platform-settings.keys.ts`, klucze `partner.*`; prowizja 10% — decyzja
 * właściciela 14.10.2026, commit 47604323). Zgodność liczb pilnuje `polecenia.spec.ts`.
 *
 * Uwaga: wartość zapisana w panelu admina (/partners) wygrywa z domyślną — strona mówi „aktualne warunki
 * widzisz w panelu”, a przed zmianą w adminie trzeba poprawić też ten plik.
 */
export const POLECENIA = {
  /** Prowizja od każdej opłaty poleconego klienta (recurring), w procentach. */
  prowizjaPct: 10,
  /** Karencja: prowizja dojrzewa po tylu dniach (ochrona przed zwrotami). */
  karencjaDni: 30,
  /** Minimalna wypłata przelewem (1 Kredyt = 1 zł); wypłata do portfela Kredytów — od dowolnej kwoty. */
  minWyplataZl: 100,
  /** Bonus: tyle Kredytów… */
  bonusKredyty: 50,
  /** …za każde tyle płacących poleceń. */
  bonusCoPolecen: 5,
} as const;

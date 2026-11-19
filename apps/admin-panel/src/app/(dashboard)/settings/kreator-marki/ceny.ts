/**
 * Paczka 130 — podgląd netto przy cenie brutto w formularzu (zanim admin zapisze). Ten sam rachunek co API
 * (bruttoNetto w apps/api/src/kreator-marki/konfiguracja-marki.ts: brutto / 1,23, do grosza); po zapisie
 * ekran pokazuje już ceny z API.
 */
export const STAWKA_VAT = 23;

export function nettoZBrutto(brutto: number): number {
  if (!Number.isFinite(brutto) || brutto < 0) return 0;
  return Math.round((Math.round(brutto * 100) * 100) / (100 + STAWKA_VAT)) / 100;
}

/** Zakresy jak ZAKRESY_MARKI w API – sprawdzane przed zapisem, żeby błąd był przy polu, a nie po wywołaniu. */
export const ZAKRESY = {
  marek: [0, 20],
  seriiMies: [0, 100],
  zmianAiMies: [0, 10_000],
  serie: [0, 500],
  zmianyAi: [0, 20_000],
  aktualizacjeSzablonowMies: [0, 60],
  cenaBrutto: [0, 10_000],
  maksRozmiarWgraniaMb: [1, 25],
} as const;

export type PoleLiczbowe = keyof typeof ZAKRESY;

/** Komunikat błędu albo null. Ceny – do grosza, reszta – liczby całkowite. */
export function bladPola(pole: PoleLiczbowe, v: number): string | null {
  const [min, max] = ZAKRESY[pole];
  const cena = pole === 'cenaBrutto';
  const ok = Number.isFinite(v) && v >= min && v <= max && (cena ? Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 : Number.isInteger(v));
  if (ok) return null;
  return cena ? `Cena brutto: od ${min} do ${max} zł, najwyżej 2 miejsca po przecinku.` : `Liczba całkowita od ${min} do ${max}.`;
}

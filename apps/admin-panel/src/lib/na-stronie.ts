/**
 * K1 — rozmiar strony list operatora z adresu (`?na_stronie=`). Liczba całkowita przycięta do 5–200
 * (200 = górna granica API list), nieczytelna wartość = domyślne 50 (jak przed zmianą).
 */
export const NA_STRONIE_DOMYSLNIE = 50;
export const NA_STRONIE_MIN = 5;
export const NA_STRONIE_MAX = 200;

export function naStronie(v: string | undefined): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return NA_STRONIE_DOMYSLNIE;
  return Math.min(Math.max(n, NA_STRONIE_MIN), NA_STRONIE_MAX);
}

/** Wartość do adresu listy — domyślnej nie dopisujemy, żeby linki zostały krótkie. */
export function naStronieWAdresie(limit: number): string | undefined {
  return limit === NA_STRONIE_DOMYSLNIE ? undefined : String(limit);
}

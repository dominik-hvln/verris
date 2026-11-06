/** Liczba po polsku (przecinek dziesiętny) z ustaloną liczbą miejsc — zamiast toFixed w tekstach dla klienta. */
export const liczba = (v: number, miejsca: number): string =>
  v.toLocaleString('pl-PL', { minimumFractionDigits: miejsca, maximumFractionDigits: miejsca });

/**
 * Kwota za godzinę z dodatkową mocą: stawki autoskalowania mają ułamki grosza (np. 0,001323 za 1% CPU), więc
 * poniżej 1 pokazujemy wszystkie cyfry (do 6 znaczących, co najmniej 2 miejsca), od 1 — do grosza. Uwaga 6.11.2026:
 * wcześniej 4 miejsca stałe, więc 1% CPU wychodził jako „0,0013”.
 */
export const kwotaGodzinowa = (v: number): string => {
  if (Math.abs(v) >= 1) return liczba(v, 2);
  const t = v.toLocaleString('pl-PL', { maximumSignificantDigits: 6, useGrouping: false });
  return (t.split(',')[1]?.length ?? 0) >= 2 ? t : liczba(v, 2);
};

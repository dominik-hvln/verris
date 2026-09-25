/** Liczba po polsku (przecinek dziesiętny) z ustaloną liczbą miejsc — zamiast toFixed w tekstach dla klienta. */
export const liczba = (v: number, miejsca: number): string =>
  v.toLocaleString('pl-PL', { minimumFractionDigits: miejsca, maximumFractionDigits: miejsca });

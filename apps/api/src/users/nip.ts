/**
 * P2-05 (paczka 109) — NIP polskiego nabywcy: 10 cyfr z cyfrą kontrolną (wagi 6-5-7-2-3-4-5-6-7, suma mod 11,
 * reszta 10 = NIP nieprawidłowy). Wcześniej API sprawdzało tylko dozwolone znaki: `1234567890` i `0000000000`
 * trafiały na faktury, a po pierwszej płatności klient nie mógł sam poprawić pomyłki.
 */
const WAGI = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** Same cyfry polskiego NIP-u (bez prefiksu PL, spacji, kropek i myślników) albo null, gdy to nie 10 cyfr. */
export function cyfryNipu(nip: string): string | null {
  const n = nip.toUpperCase().replace(/[\s.-]/g, '').replace(/^PL/, '');
  return /^\d{10}$/.test(n) ? n : null;
}

export function poprawnyNip(nip: string): boolean {
  const c = cyfryNipu(nip);
  if (!c || /^0+$/.test(c)) return false;
  const suma = WAGI.reduce((s, w, i) => s + w * Number(c[i]), 0) % 11;
  return suma !== 10 && suma === Number(c[9]);
}

/** Komunikat przy polu NIP dla nabywcy z Polski (null = w porządku albo pole puste). */
export function bladNipuPl(nip: string | null | undefined): string | null {
  if (!nip?.trim()) return null;
  if (!cyfryNipu(nip)) return 'NIP: 10 cyfr, np. 123-456-32-18 (numer VAT-UE z prefiksem innego kraju wpisz przy kraju tej firmy).';
  if (!poprawnyNip(nip)) return 'Ten NIP ma błędną cyfrę kontrolną – sprawdź, czy nie ma literówki.';
  return null;
}

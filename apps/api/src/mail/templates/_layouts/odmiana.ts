/**
 * Polska odmiana liczebników w mailach (P1-08: „24 godzin” zamiast „24 godziny”) — ta sama reguła co `plForm`
 * w panelu klienta (`apps/client-panel/src/lib/pl.ts`): 1 → jeden; końcówka 2–4 poza 12–14 → kilka; reszta → wiele.
 */
export function plForm(n: number, jeden: string, kilka: string, wiele: string): string {
  const a = Math.abs(n);
  if (a === 1) return jeden;
  const d = a % 10;
  const s = a % 100;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return kilka;
  return wiele;
}

/** „24 godziny”, „5 godzin”, „1 godzinę” — biernik po „przez/ważny …”. */
export const godzin = (n: number): string => `${n} ${plForm(n, 'godzinę', 'godziny', 'godzin')}`;

/** „30 minut”, „2 minuty”, „1 minutę”. */
export const minut = (n: number): string => `${n} ${plForm(n, 'minutę', 'minuty', 'minut')}`;

/**
 * P4-13 — kwota w mailu jak w panelu: „150,00 zł”, „1 250,50 zł” (przecinek dziesiętny, spacja co trzy cyfry),
 * a nie „150.00 zł”. Wejście: kwota z bazy jako tekst albo liczba.
 */
export function kwotaPl(kwota: string | number): string {
  const n = Number(String(kwota).replace(',', '.'));
  if (!Number.isFinite(n)) return String(kwota);
  const [calosc, grosze] = Math.abs(n).toFixed(2).split('.');
  const zSpacjami = calosc.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${zSpacjami},${grosze}`;
}

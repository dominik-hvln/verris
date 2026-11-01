/**
 * Polska odmiana liczebników (1 → one; końcówka 2–4 poza 12–14 → few; reszta → many).
 * Kopia apps/client-panel/src/lib/pl.ts — www nie zależy od pakietów paneli; trzymaj oba w zgodzie.
 */
export function plForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

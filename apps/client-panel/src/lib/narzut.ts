/**
 * O-07 — cena z narzutem resellera, liczona tak samo jak w API (`zNarzutem`: 2 miejsca, HALF_UP),
 * żeby klient resellera widział dokładnie tę kwotę, którą zapłaci. Liczymy w groszach na liczbach
 * całkowitych — bez błędów zmiennoprzecinkowych.
 */
export function cenaZNarzutem(cena: string, pct: number): string {
  if (!pct || pct <= 0) return cena;
  const grosze = Math.round(Number(cena) * 100);
  return (Math.floor((grosze * (100 + pct) + 50) / 100) / 100).toFixed(2);
}

export function planyZNarzutem<T extends { priceMonthly: string; priceYearly: string }>(plany: T[], pct: number): T[] {
  if (!pct || pct <= 0) return plany;
  return plany.map((p) => ({ ...p, priceMonthly: cenaZNarzutem(p.priceMonthly, pct), priceYearly: cenaZNarzutem(p.priceYearly, pct) }));
}

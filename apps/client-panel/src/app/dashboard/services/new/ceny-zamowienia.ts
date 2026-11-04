import { formatCredits, formatPln } from '@/lib/credits';

/** Stawka VAT cennika (ceny planów w API są brutto, jak na www — `apps/www/src/lib/ceny.ts`). */
const VAT = 0.23;

/** Kwota netto z brutto, zaokrąglona do grosza (ta sama reguła co na www). */
export function netto(brutto: number | string): number {
  const n = typeof brutto === 'string' ? Number.parseFloat(brutto) : brutto;
  return Math.round((n / (1 + VAT)) * 100) / 100;
}

/**
 * P4-10 (beta 3.11) — cena w zamówieniu: najpierw złote brutto, netto i kredyty jako dodatek
 * („45,00 zł brutto” · „36,59 zł netto · z portfela 45,00 K”).
 */
export function zlBrutto(kwota: number | string): string {
  return `${formatPln(kwota)} brutto`;
}

export function dodatekNettoIK(kwota: number | string): string {
  return `${formatPln(netto(kwota))} netto · z portfela ${formatCredits(kwota)}`;
}

/** Limit kosztu autoskalowania wpisany przez klienta: kwota > 0 i ≤ 99 999,99 zł (jak w API), albo błąd. */
export function odczytajLimit(wpisany: string): { kwota: number } | { blad: string } {
  const t = wpisany.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return { blad: 'Wpisz kwotę limitu albo wybierz „Bez limitu”.' };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { blad: 'Limit podaj w złotych, np. 30 albo 49,99.' };
  const kwota = Number(t);
  if (kwota <= 0) return { blad: 'Limit musi być większy od zera. Bez limitu wybierz „Bez limitu”.' };
  if (kwota > 99_999.99) return { blad: 'Limit może wynosić najwyżej 99 999,99 zł.' };
  return { kwota };
}

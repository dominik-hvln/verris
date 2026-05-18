/**
 * Wirtualna waluta portfela klienta Verris.
 *
 * Założenia:
 * - 1 PLN = 1 kredyt (skrót `K`). Kurs stały, brak konwersji.
 * - Backend, ledger (`WalletTransaction`), Stripe i faktury pracują w PLN —
 *   to jest kosmetyka UI, nie zmiana modelu danych. Faktury wystawiamy w PLN
 *   zgodnie z polskim prawem księgowym.
 * - Helper akceptuje string albo number (Prisma Decimal serializuje się do
 *   stringa po przejściu przez JSON).
 */

export const CREDIT_SHORT = 'K';
export const CREDIT_NAME = 'kredyty';
export const CREDIT_RATE_INFO = '1 zł = 1 kredyt';
export const CREDIT_DISCLAIMER =
  'Faktury wystawiamy w PLN zgodnie z polskim prawem (1 zł = 1 kredyt Verris).';

/** Polish plural form: "kredyt" / "kredyty" / "kredytów". */
export function pluralCredits(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  if (abs === 1) return 'kredyt';
  const lastDigit = abs % 10;
  const lastTwo = abs % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return 'kredyty';
  }
  return 'kredytów';
}

interface FormatOpts {
  /** Append " K". Defaults to true. */
  withUnit?: boolean;
  /** Show explicit "+" for positive amounts. Defaults to false. */
  signed?: boolean;
  /** Number of decimal places. Defaults to 2. */
  fractionDigits?: number;
}

/**
 * Render an amount as "1 234,56 K" (pl-PL locale, space as thousand sep,
 * comma as decimal sep). Returns "— K" when the input is not parseable so
 * we never display NaN to the user.
 */
export function formatCredits(amount: string | number | null | undefined, opts: FormatOpts = {}): string {
  const { withUnit = true, signed = false, fractionDigits = 2 } = opts;
  if (amount === null || amount === undefined) return withUnit ? `— ${CREDIT_SHORT}` : '—';
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return withUnit ? `— ${CREDIT_SHORT}` : '—';
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('pl-PL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const sign = num < 0 ? '−' : signed && num > 0 ? '+' : '';
  return withUnit ? `${sign}${formatted} ${CREDIT_SHORT}` : `${sign}${formatted}`;
}

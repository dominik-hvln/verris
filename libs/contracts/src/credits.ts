/** Wirtualna waluta portfela Verris — 1 PLN = 1 kredyt (K). Backend/faktury w PLN. */

export const CREDIT_SHORT = 'K';
export const CREDIT_NAME = 'kredyty';
export const CREDIT_RATE_INFO = '1 zł = 1 kredyt';
export const CREDIT_DISCLAIMER =
  'Faktury wystawiamy w PLN zgodnie z polskim prawem (1 zł = 1 kredyt Verris).';

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
  withUnit?: boolean;
  signed?: boolean;
  fractionDigits?: number;
}

export function formatCredits(
  amount: string | number | null | undefined,
  opts: FormatOpts = {},
): string {
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

export function formatPln(
  amount: string | number | null | undefined,
  opts: { withCurrency?: boolean; fractionDigits?: number } = {},
): string {
  const { withCurrency = true, fractionDigits = 2 } = opts;
  if (amount === null || amount === undefined) return withCurrency ? '— zł' : '—';
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return withCurrency ? '— zł' : '—';
  const formatted = Math.abs(num).toLocaleString('pl-PL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const sign = num < 0 ? '−' : '';
  return withCurrency ? `${sign}${formatted} zł` : `${sign}${formatted}`;
}

/** Dla paneli operatorów: kredyty + równoważnik PLN przy walucie PLN. */
export function formatPlnAndCredits(
  amount: string | number | null | undefined,
  currency = 'PLN',
): string {
  if (currency !== 'PLN') {
    const num = typeof amount === 'string' ? amount : String(amount ?? '—');
    return `${num} ${currency}`;
  }
  return `${formatCredits(amount)} (≈ ${formatPln(amount)})`;
}

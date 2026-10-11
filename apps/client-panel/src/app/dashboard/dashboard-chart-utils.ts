import type { SubscriptionStatus } from '@verris/contracts';
import type { EcoLedgerRowDto } from './eco/eco-data';
import { dataPl, dzienPl, ostatnieDniPl } from '@/lib/data-pl';

export const SERVICE_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Aktywne',
  PROVISIONING: 'Uruchamianie',
  PENDING_PAYMENT: 'Oczekuje płatności',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszone',
  CANCELED: 'Anulowane',
  EXPIRED: 'Wygasłe',
};

export type WalletMonthlyChartPoint = {
  month: string;
  label: string;
  inflow: number;
  outflow: number;
};

/** Mapuje agregat z API na wartości numeryczne do wykresu. */
export function mapWalletMonthlyFlow(
  points: { month: string; label: string; inflow: string; outflow: string }[],
): WalletMonthlyChartPoint[] {
  return points.map((p) => ({
    month: p.month,
    label: p.label,
    inflow: round2(Number.parseFloat(p.inflow) || 0),
    outflow: round2(Number.parseFloat(p.outflow) || 0),
  }));
}

/** Dni w czasie polskim — wykres renderuje się na serwerze (UTC) i w przeglądarce; między 22 a 24 UTC dni się rozjeżdżały. */
export function buildEcoLedgerSeries(ledger: EcoLedgerRowDto[], days = 14) {
  const keys = ostatnieDniPl(days);

  const buckets = new Map(keys.map((k) => [k, { gained: 0, spent: 0, label: formatDayLabel(k) }]));

  for (const row of ledger) {
    const key = dzienPl(row.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.delta >= 0) bucket.gained += row.delta;
    else bucket.spent += Math.abs(row.delta);
  }

  return keys.map((k) => {
    const b = buckets.get(k)!;
    return { date: k, label: b.label, gained: b.gained, spent: b.spent };
  });
}

function formatDayLabel(isoDate: string): string {
  return dataPl(`${isoDate}T12:00:00Z`, { day: 'numeric', month: 'short' });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

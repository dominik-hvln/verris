import type { ServiceSummaryDto, SubscriptionStatus } from '@verris/contracts';
import type { EcoLedgerRowDto } from './eco/eco-data';
import type { TicketSummary } from './support/actions';

export const SERVICE_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Aktywne',
  PROVISIONING: 'Uruchamianie',
  PENDING_PAYMENT: 'Oczekuje płatności',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszone',
  CANCELED: 'Anulowane',
  EXPIRED: 'Wygasłe',
};

const SERVICE_STATUS_COLOR: Record<SubscriptionStatus, string> = {
  ACTIVE: '#34d399',
  PROVISIONING: '#60a5fa',
  PENDING_PAYMENT: '#a78bfa',
  PAST_DUE: '#fbbf24',
  SUSPENDED: '#f87171',
  CANCELED: '#737373',
  EXPIRED: '#525252',
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

export function buildServiceStatusSeries(services: ServiceSummaryDto[]) {
  const counts = new Map<SubscriptionStatus, number>();
  for (const s of services) {
    counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, value]) => ({
    status,
    name: SERVICE_STATUS_LABEL[status] ?? status,
    value,
    fill: SERVICE_STATUS_COLOR[status] ?? '#a3a3a3',
  }));
}

export function buildEcoLedgerSeries(ledger: EcoLedgerRowDto[], days = 14) {
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }

  const buckets = new Map(keys.map((k) => [k, { gained: 0, spent: 0, label: formatDayLabel(k) }]));

  for (const row of ledger) {
    const key = row.createdAt.slice(0, 10);
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

export function buildServiceHealthSeries(services: ServiceSummaryDto[], limit = 8) {
  return services
    .filter((s) => s.health?.score != null)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      name: truncateLabel(s.planName || s.planSlug, 18),
      score: s.health.score,
      fill:
        s.health.label === 'healthy'
          ? '#34d399'
          : s.health.label === 'attention'
            ? '#fbbf24'
            : '#f87171',
    }));
}

export function buildTicketStatusSeries(tickets: TicketSummary[]) {
  const labels: Record<string, string> = {
    OPEN: 'Otwarte',
    IN_PROGRESS: 'W toku',
    RESOLVED: 'Rozwiązane',
    CLOSED: 'Zamknięte',
  };
  const colors: Record<string, string> = {
    OPEN: '#34d399',
    IN_PROGRESS: '#60a5fa',
    RESOLVED: '#a3a3a3',
    CLOSED: '#525252',
  };
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, value]) => ({
    status,
    name: labels[status] ?? status,
    value,
    fill: colors[status] ?? '#737373',
  }));
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function truncateLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

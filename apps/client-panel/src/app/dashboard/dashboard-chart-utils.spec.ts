import type { SubscriptionStatus } from '@verris/contracts';
import { SERVICE_STATUS_LABEL, buildEcoLedgerSeries, mapWalletMonthlyFlow } from './dashboard-chart-utils';

/**
 * X-05 — dane wykresów pulpitu i strony płatności.
 *
 * CO PILNUJE.
 *  - Wykres portfela: kwoty z API przychodzą jako stringi; śmieć ma dać 0,
 *    a nie `NaN` (recharts rysuje wtedy dziurę albo nic), i zaokrąglamy do
 *    groszy, żeby dymek nie pokazał `12.300000000000001`.
 *  - Każdy status subskrypcji z kontraktu ma polską etykietę — inaczej klient
 *    zobaczy `PAST_DUE` zamiast „Zaległa płatność".
 *  - Seria EKO: dni bez ruchu są zerami (oś ciągła), wpisy spoza okna nie są
 *    doliczane, a wydane punkty są dodatnią wysokością słupka.
 */

describe('X-05 mapWalletMonthlyFlow', () => {
  it('parsuje kwoty, zaokrągla do groszy, śmieci → 0', () => {
    const out = mapWalletMonthlyFlow([
      { month: '2026-08', label: 'sie', inflow: '33.333', outflow: '12.30' },
      { month: '2026-09', label: 'wrz', inflow: 'abc', outflow: '' },
    ]);
    expect(out).toEqual([
      { month: '2026-08', label: 'sie', inflow: 33.33, outflow: 12.3 },
      { month: '2026-09', label: 'wrz', inflow: 0, outflow: 0 },
    ]);
  });
});

describe('X-05 SERVICE_STATUS_LABEL', () => {
  it('każdy status subskrypcji ma niepustą polską etykietę', () => {
    const all: SubscriptionStatus[] = ['ACTIVE', 'PROVISIONING', 'PENDING_PAYMENT', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED'];
    for (const s of all) expect(SERVICE_STATUS_LABEL[s]).toMatch(/\S/);
    expect(SERVICE_STATUS_LABEL.PAST_DUE).toBe('Zaległa płatność');
  });
});

describe('X-05 buildEcoLedgerSeries', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const row = (createdAt: string, delta: number) => ({ id: createdAt + delta, delta, reason: 'X', subscriptionId: null, createdAt });

  it('ciągła oś N dni kończąca się dziś, dni bez ruchu = 0', () => {
    const series = buildEcoLedgerSeries([], 3);
    expect(series.map((s) => s.date)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(series.every((s) => s.gained === 0 && s.spent === 0)).toBe(true);
  });

  it('zyski i wydatki rozdzielone, wydatki jako wartość dodatnia, wpisy spoza okna pominięte', () => {
    const series = buildEcoLedgerSeries(
      [
        row('2026-09-24T09:00:00.000Z', 5),
        row('2026-09-24T10:00:00.000Z', 3),
        row('2026-09-23T10:00:00.000Z', -100),
        row('2026-08-01T10:00:00.000Z', 999),
      ],
      3,
    );
    expect(series.map((s) => [s.date, s.gained, s.spent])).toEqual([
      ['2026-09-22', 0, 0],
      ['2026-09-23', 0, 100],
      ['2026-09-24', 8, 0],
    ]);
  });
});

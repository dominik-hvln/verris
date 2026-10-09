/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ServiceForecastDto } from '@verris/contracts';

/** Zakładka „Zużycie i prognoza”: podsumowanie + 4 wykresy (7 dni historii, przerywana prognoza, limit). */
const mockForecast = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-forecast-actions', () => ({
  fetchServiceForecastAction: (...a: unknown[]) => mockForecast(...a),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-usage-actions', () => ({
  fetchHostingUsageAction: async () => ({
    ok: true,
    dane: {
      window: '24h',
      rows: [0, 1, 2].map((m) => ({
        // Wykres 24 h liczy słupki od zegara (bucketize po czasie) — próbki muszą być z ostatniej doby.
        bucketStart: new Date(Date.now() - (3 - m) * 60_000).toISOString(),
        cpuUsageAvg: 12 + m,
        cpuUsageMax: 30,
        memUsageAvgMb: 300,
        memUsageMaxMb: 420,
        diskUsageMb: 1800,
        ioUsageKbps: 120,
      })),
    },
  }),
}));
jest.mock('@/components/hosting/AccountStatsCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/hosting/DiskUsagePanel', () => ({ DiskUsagePanel: () => null }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import UsageTab from './UsageTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const historia = Array.from({ length: 168 }, (_, h) => ({ t: new Date(Date.UTC(2026, 8, 28) + h * 3_600_000).toISOString(), v: 5 + (h % 3) }));
const zasob = (resource: 'CPU' | 'RAM' | 'DISK' | 'IO', currentPct: number, predictedPct: number) => ({
  resource,
  currentPct,
  predictedPct,
  trend: 'flat' as const,
  daysToLimit: null,
  note: null,
  historia,
});
const prognoza = (extra: Partial<ServiceForecastDto> = {}): ServiceForecastDto => ({
  generatedAt: '2026-10-05T12:00:00Z',
  available: true,
  unavailableReason: null,
  confidence: 'high',
  horizonDays: 7,
  summary: 'Zasoby w normie — przy obecnym tempie żaden limit planu nie zostanie osiągnięty w ciągu 30 dni.',
  // Kolejność z API celowo inna — panel układa CPU, RAM, Dysk, IO.
  resources: [zasob('IO', 3, 3), zasob('DISK', 42, 49), zasob('CPU', 6, 6), zasob('RAM', 11, 12)],
  recommendations: [],
  ...extra,
});

let root: Root;
let el: HTMLElement;
async function zamontuj(f: ServiceForecastDto) {
  mockForecast.mockResolvedValue({ ok: true, dane: f });
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<UsageTab serviceId="s1" />));
}
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('UsageTab — podsumowanie i 4 wykresy z prognozą', () => {
  it('bez AI: 4 wykresy (historia + przerywana prognoza + limit), „teraz · za 7 dni”, stopka bez zdania o AI', async () => {
    await zamontuj(prognoza());
    expect(mockForecast).toHaveBeenCalledWith('s1'); // prognoza wczytuje się sama przy wejściu
    expect(el.textContent).toContain('Pewność: wysoka');
    expect(el.textContent).toContain('7 dni historii · prognoza na 7 dni');
    const karty = [...el.querySelectorAll('section')].filter((s) => s.querySelector('h3'));
    expect(karty.map((k) => k.querySelector('h3')!.textContent)).toEqual(['CPU', 'Pamięć RAM', 'Dysk', 'Operacje dyskowe (IO)']);
    for (const k of karty) {
      expect(k.querySelector('[role="slider"]')).not.toBeNull();
      expect(k.querySelector('polygon')!.getAttribute('points')!.split(' ').length).toBe(168 + 2); // pole pod historią
      const linie = k.querySelectorAll('polyline');
      expect(linie).toHaveLength(2);
      expect(linie[0]!.getAttribute('points')!.split(' ')).toHaveLength(168);
      expect(linie[1]!.getAttribute('stroke-dasharray')).toBe('6 5');
      expect(k.querySelector('line[stroke="var(--crit)"]')).not.toBeNull();
      expect(k.textContent).toContain('−7 dni');
      expect(k.textContent).toContain('dziś');
      expect(k.textContent).toContain('+7 dni');
    }
    expect(karty[2]!.textContent).toContain('teraz 42% · za 7 dni 49%');
    const stopka = [...el.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Prognoza orientacyjna'))!;
    expect(stopka.textContent).toBe('Prognoza orientacyjna, liczona przez Verris z historycznych metryk — nie stanowi gwarancji.');
    expect(el.querySelector('[data-ai-generated]')).toBeNull();
    // 24 h CPU na żywo zostaje (piąty wykres)
    expect(el.querySelectorAll('[role="slider"]')).toHaveLength(5);
  });

  it('z komentarzem AI: tekst oznaczony data-ai-generated, rekomendacje i dopisek o AI w stopce', async () => {
    await zamontuj(prognoza({ komentarzAi: true, summary: 'Dysk rośnie powoli.', recommendations: ['Usuń stare kopie'] }));
    expect([...el.querySelectorAll('[data-ai-generated="true"]')].map((x) => x.textContent)).toEqual(
      expect.arrayContaining(['Dysk rośnie powoli.', expect.stringContaining('Usuń stare kopie')]),
    );
    const stopka = [...el.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Prognoza orientacyjna'))!;
    expect(stopka.textContent).toBe(
      'Prognoza orientacyjna, liczona przez Verris z historycznych metryk — nie stanowi gwarancji. Opis i rekomendacje tworzy AI.',
    );
  });

  it('za mało danych: komunikat zamiast wykresów', async () => {
    await zamontuj({ ...prognoza(), available: false, unavailableReason: 'Za mało danych telemetrycznych.', resources: [] });
    expect(el.textContent).toContain('Za mało danych telemetrycznych.');
    expect(el.querySelectorAll('polyline')).toHaveLength(0);
  });
});

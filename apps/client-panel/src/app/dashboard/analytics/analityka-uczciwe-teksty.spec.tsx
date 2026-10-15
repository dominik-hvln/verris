/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('./actions', () => ({}));

import { StatsView } from './analytics-client';
import type { AnalyticsStats } from './actions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Noc 15.10 — PRZEGLAD_LUK 3.9 i 3.10:
 * - „Kraje” czytało nagłówek cf-ipcountry/x-geo-country, którego przed API nic nie ustawia (brak Cloudflare) — sekcja
 *   była zawsze pusta. Pokazujemy ją dopiero, gdy w okresie są dane o kraju.
 * - „bez danych osobowych” jest sprzeczne z przyjętą zasadą (IP jest przetwarzane, zanim powstanie skrót).
 */
const stats = (countries: AnalyticsStats['countries']): AnalyticsStats =>
  ({
    totals: { pageviews: 10, visitors: 4 },
    timeseries: [{ date: '2026-10-14', pageviews: 10, visitors: 4 }],
    topPages: [{ path: '/', count: 10 }],
    topReferrers: [],
    countries,
    devices: [{ deviceType: 'desktop', count: 10 }],
  }) as unknown as AnalyticsStats;

describe('analityka — tylko to, co naprawdę zbieramy', () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it('bez danych o kraju nie ma sekcji „Kraje”', () => {
    act(() => root.render(<StatsView stats={stats([])} />));
    expect(el.textContent).toContain('Urządzenia');
    expect(el.textContent).not.toContain('Kraje');
  });

  it('z danymi o kraju sekcja „Kraje” jest', () => {
    act(() => root.render(<StatsView stats={stats([{ country: 'PL', count: 7 }])} />));
    expect(el.textContent).toContain('Kraje');
    // Decyzja 15.10 (#16): licencja DB-IP Lite (CC BY 4.0) wymaga wzmianki o źródle przy danych.
    expect(el.textContent).toContain('IP Geolocation by DB-IP');
    expect(el.querySelector('a[href="https://db-ip.com"]')).not.toBeNull();
    expect(el.textContent).toContain('PL');
  });

  it('opis strony nie obiecuje „bez danych osobowych”', () => {
    const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(page).not.toMatch(/bez danych osobowych/i);
    expect(page).toMatch(/bez cookies/);
  });
});

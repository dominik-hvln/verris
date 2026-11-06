/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DayDto, PublicServiceDto } from '@/lib/api';
import { dodajDni } from '@/lib/format';
import { Uslugi } from './uslugi';

/**
 * 06.11 — lista usług pokazuje zawsze pełne 90 dni (wcześniej od pierwszego pomiaru: „pomiary od 7 paź · 31 dni”).
 * Nagłówek mówi, od kiedy są pomiary, dopóki ten dzień jest w oknie; procent ma opis okresu, z którego jest liczony.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DZIS = '2026-11-06';
const dni = (start: string): DayDto[] =>
  Array.from({ length: 90 }, (_, i) => {
    const date = dodajDni(DZIS, i - 89);
    return date < start
      ? { date, state: 'NO_DATA', uptimePct: null, avgLatencyMs: null }
      : { date, state: 'OK', uptimePct: 100, avgLatencyMs: 150 };
  });
const usluga = (key: string, name: string, start: string): PublicServiceDto => ({
  key,
  name,
  state: 'OK',
  uptime90Pct: 99.98,
  avgLatencyMs: 150,
  days: dni(start),
  latency24h: [],
});

let root: Root;
let k: HTMLElement;
async function renderuj(services: PublicServiceDto[]) {
  k = document.createElement('div');
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () => root.render(<Uslugi services={services} zdarzenia={[]} prace={[]} teraz={`${DZIS}T12:00:00Z`} />));
}
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

describe('Uslugi', () => {
  it('pomiary od 7 paź: 90 słupków w każdym wierszu, nagłówek z datą startu, oś „90 dni temu”', async () => {
    await renderuj([usluga('poczta', 'Poczta', '2026-10-07'), usluga('api', 'API', '2026-10-20')]);
    expect(k.querySelector('.sv-sek-glowka .sv-meta')!.textContent).toBe('ostatnie 90 dni · pomiary od 7 paź');
    const paski = [...k.querySelectorAll('.sv-pasek')];
    expect(paski.map((p) => p.querySelectorAll('.sv-dzien').length)).toEqual([90, 90]);
    // „Przed” liczy się per usługa: sonda API ruszyła 20.10.
    expect(paski[1].querySelectorAll('[data-k="przed"]').length).toBe(72);
    expect(k.querySelector('.sv-tylko-komp')!.textContent).toBe('90 dni temu');
    expect(k.querySelector('.sv-tylko-tel')!.textContent).toBe('30 dni temu');
    const proc = k.querySelector('.sv-proc')!;
    expect(proc.getAttribute('title')).toBe('Dostępność z dni z pomiarami: od 7 paź do dziś');
    expect(proc.querySelector('.st-sr')!.textContent).toBe('Dostępność z dni z pomiarami: od 7 paź do dziś: ');
    expect(k.querySelector('.sv-legenda')!.textContent).toContain('przed uruchomieniem pomiarów');
  });

  it('gdy pierwszy pomiar wypadł z okna: samo „ostatnie 90 dni”, bez dni „przed”', async () => {
    await renderuj([usluga('poczta', 'Poczta', '2026-01-01')]);
    expect(k.querySelector('.sv-sek-glowka .sv-meta')!.textContent).toBe('ostatnie 90 dni');
    expect(k.querySelectorAll('[data-k="przed"]')).toHaveLength(0);
    expect(k.querySelector('.sv-proc')!.getAttribute('title')).toBe('Dostępność z ostatnich 90 dni, liczona z dni z pomiarami');
    expect(k.querySelector('.sv-legenda')!.textContent).not.toContain('przed uruchomieniem');
  });
});

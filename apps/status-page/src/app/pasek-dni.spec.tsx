/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DayDto } from '@/lib/api';
import { dodajDni } from '@/lib/format';
import { pierwszyPomiar } from '@/lib/widok';
import { PasekDni } from './pasek-dni';

/**
 * 06.11 — pasek dni zawsze ma 90 słupków (wcześniej zaczynał się od pierwszego pomiaru: 31 słupków),
 * dni sprzed uruchomienia sond są oznaczone osobno, a dzień ma interaktywny dymek zamiast natywnego `title`.
 * Klawiatura: jeden przystanek Tab na cały pasek (A3-4 — było 57 przystanków w wykresach).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DZIS = '2026-11-06';
const START = '2026-10-07';
const AWARIA = '2026-10-14';

/** 90 dni kończących się dziś; przed 7.10 sondy nie działały, 14.10 awaria. */
function okno(): DayDto[] {
  return Array.from({ length: 90 }, (_, i) => {
    const date = dodajDni(DZIS, i - 89);
    if (date < START) return { date, state: 'NO_DATA', uptimePct: null, avgLatencyMs: null };
    if (date === AWARIA) return { date, state: 'DOWN', uptimePct: 72.3, avgLatencyMs: 412 };
    return { date, state: 'OK', uptimePct: 100, avgLatencyMs: 180 };
  });
}

let root: Root;
let k: HTMLElement;
const dni = okno();

beforeEach(async () => {
  k = document.createElement('div');
  document.body.appendChild(k);
  root = createRoot(k);
  await act(async () =>
    root.render(
      <PasekDni
        nazwa="Poczta"
        dni={dni}
        pierwszyPomiar={pierwszyPomiar(dni)}
        zdarzenia={{ [AWARIA]: ['Awaria · 10:00–16:39 · 6 h 39 min'] }}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  k.remove();
});

const slupki = () => [...k.querySelectorAll<HTMLButtonElement>('.sv-dzien')];
const dymek = () => k.querySelector<HTMLElement>('[role="tooltip"]')!;
const indeks = (date: string) => dni.findIndex((d) => d.date === date);
const klawisz = (key: string) =>
  act(async () => {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

describe('PasekDni', () => {
  it('pokazuje 90 słupków; dni sprzed pierwszego pomiaru są oznaczone inaczej niż „brak pomiarów”', () => {
    const s = slupki();
    expect(s).toHaveLength(90);
    const przed = s.filter((b) => b.dataset.k === 'przed');
    expect(przed).toHaveLength(indeks(START));
    expect(przed.length).toBeGreaterThan(0);
    expect(s[indeks(START)].dataset.k).toBe('ok');
    expect(s[0].getAttribute('aria-label')).toBe('9 sie: przed uruchomieniem pomiarów');
    // Telefon: widać ostatnie 30 dni — starsze mają klasę .old.
    expect(s.filter((b) => b.classList.contains('old'))).toHaveLength(60);
  });

  it('cały pasek to jeden przystanek Tab – tabIndex 0 ma tylko dzisiejszy słupek', () => {
    const z0 = slupki().filter((b) => b.tabIndex === 0);
    expect(z0).toHaveLength(1);
    expect(z0[0]).toBe(slupki()[89]);
  });

  it('dymek dnia z awarią: data słownie, stan, dostępność, czas odpowiedzi i zdarzenie', async () => {
    expect(dymek().hidden).toBe(true);
    const b = slupki()[indeks(AWARIA)];
    await act(async () => b.click());
    const t = dymek();
    expect(t.hidden).toBe(false);
    expect(t.textContent).toContain('środa, 14 października 2026');
    expect(t.textContent).toContain('awaria');
    expect(t.textContent).toContain('Dostępność 72,30%');
    expect(t.textContent).toContain('Śr. czas odpowiedzi 412 ms');
    expect(t.textContent).toContain('Awaria · 10:00–16:39 · 6 h 39 min');
    expect(b.getAttribute('aria-describedby')).toBe(t.id);
    expect(b.hasAttribute('data-otwarty')).toBe(true);
  });

  it('dymek dnia sprzed pomiarów mówi, że sondy jeszcze nie działały', async () => {
    await act(async () => slupki()[3].click());
    expect(dymek().textContent).toContain('przed uruchomieniem pomiarów');
    expect(dymek().textContent).toContain('Sondy jeszcze wtedy nie działały');
    expect(dymek().textContent).not.toContain('Dostępność ');
  });

  it('strzałki, Home i End zmieniają aktywny dzień, przenoszą fokus i pokazują dymek', async () => {
    await act(async () => slupki()[89].focus());
    expect(dymek().textContent).toContain('piątek, 6 listopada 2026');

    await klawisz('ArrowLeft');
    expect(document.activeElement).toBe(slupki()[88]);
    expect(slupki()[88].tabIndex).toBe(0);
    expect(slupki().filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(dymek().textContent).toContain('czwartek, 5 listopada 2026');

    await klawisz('ArrowRight');
    await klawisz('ArrowRight'); // na ostatnim dniu zostaje
    expect(document.activeElement).toBe(slupki()[89]);

    await klawisz('Home');
    expect(document.activeElement).toBe(slupki()[0]);
    expect(dymek().textContent).toContain('niedziela, 9 sierpnia 2026');

    await klawisz('End');
    expect(document.activeElement).toBe(slupki()[89]);
  });

  it('Escape i dotknięcie poza paskiem zamykają dymek', async () => {
    await act(async () => slupki()[89].focus());
    expect(dymek().hidden).toBe(false);
    await klawisz('Escape');
    expect(dymek().hidden).toBe(true);
    expect(document.activeElement).toBe(slupki()[89]);

    await act(async () => slupki()[50].click());
    expect(dymek().hidden).toBe(false);
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(dymek().hidden).toBe(true);
  });
});

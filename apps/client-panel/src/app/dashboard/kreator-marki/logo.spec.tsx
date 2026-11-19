/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { koloryMarki, type ProjektLogo } from '@verris/kreator/klient';
import { LogoNaZywo, odczytajKsztalt, zadaniaNapisu } from './logo';

/**
 * Paczka 131 – logo w przeglądarce: najpierw napis `<text>` z krojem z trasy panelu (fonts-proxy), potem krzywe
 * z GET /kreator-marki/napis; odpowiedź API z czymś innym niż dane ścieżki nie trafia do SVG.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const projekt = (o: Partial<ProjektLogo['napis']> = {}): ProjektLogo => ({
  sygnet: { typ: 'biblioteka', rodzina: 'kreg-fala', parametry: {}, ziarno: 0 },
  napis: { font: 'Fraunces', waga: 600, styl: 'dwa', rozstrzelenie: 0, podpis: true, ...o },
  kolory: koloryMarki(240, 'jasna'),
  uklad: 'poziomy',
  fonty: { naglowki: 'Fraunces', tekst: 'Inter' },
});

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  jest.useFakeTimers();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  jest.useRealTimers();
});

it('kształt napisu z API: tylko polecenia ścieżki i liczby', () => {
  expect(odczytajKsztalt({ d: 'M0 0L10 0Z', szerokosc: 10, wysokoscWersalikow: 700, zejscie: 200 })).toEqual({ d: 'M0 0L10 0Z', szerokosc: 10, wysokoscWersalikow: 700, zejscie: 200 });
  expect(odczytajKsztalt({ d: 'M0 0"/><script>', szerokosc: 10, wysokoscWersalikow: 700, zejscie: 0 })).toBeNull();
  expect(odczytajKsztalt({ d: 'M0 0', szerokosc: 'x', wysokoscWersalikow: 700, zejscie: 0 })).toBeNull();
  expect(odczytajKsztalt(null)).toBeNull();
});

it('teksty do kształtowania = wiersze i podpis tak, jak składa je zlozLogo', () => {
  const z = zadaniaNapisu(projekt(), 'Pracownia Fal', 'Szkoła żeglarstwa');
  expect(z.map((x) => x?.tekst ?? null)).toEqual(['Pracownia', 'Fal', 'SZKOŁA ŻEGLARSTWA']);
  expect(z[2]).toMatchObject({ font: 'Inter', waga: 600, rozstrzelenie: 200 });
  expect(zadaniaNapisu(projekt({ styl: 'jeden', podpis: false }), 'Pracownia Fal', 'Szkoła')).toEqual([expect.objectContaining({ tekst: 'Pracownia Fal' }), null, null]);
});

it('podgląd: <text> z krojem (font-face z trasy panelu), po odpowiedzi API – krzywe', async () => {
  const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ d: 'M0 0L500 0L500 -700Z', szerokosc: 500, wysokoscWersalikow: 700, zejscie: 200 }) }));
  global.fetch = fetchMock as never;
  await act(async () => root.render(<LogoNaZywo projekt={projekt({ styl: 'jeden' })} nazwa="Pracownia Fal" />));
  const svg = el.querySelector('svg')!;
  expect(svg.getAttribute('aria-label')).toBe('Pracownia Fal');
  expect(svg.querySelector('text')?.textContent).toBe('Pracownia Fal');
  expect(document.getElementById('kreator-marki-fonty')?.textContent).toContain('/api/kreator-marki/fonty/fraunces-600-latin-ext.woff2');
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => undefined);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/kreator-marki/napis?font=Fraunces&waga=600&tekst=Pracownia%20Fal'), expect.anything());
  expect(el.querySelector('svg text')).toBeNull();
  expect(el.querySelector('svg path[transform]')?.getAttribute('d')).toBe('M0 0L500 0L500 -700Z');
});

it('API bez krzywych (np. błąd) – zostaje <text>, podgląd się nie psuje', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as never;
  await act(async () => root.render(<LogoNaZywo projekt={projekt({ styl: 'jeden', font: 'Inter' })} nazwa="Hydro-Mix" />));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => undefined);
  expect(el.querySelector('svg text')?.textContent).toBe('Hydro-Mix');
});

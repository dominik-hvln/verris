/**
 * @jest-environment jsdom
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import axe from 'axe-core';

/**
 * P-12 (WCAG 2.1 AA) — automatyczny audyt głównych widoków usługi: przegląd, poczta, bazy, pliki,
 * domeny i DNS. Renderuje prawdziwą stronę usługi (`/dashboard/services/[id]?tab=…`) w jsdom, na
 * danych z `dane-widokow.ts`, i puszcza axe-core (reguły WCAG 2.0/2.1 A+AA, dobre praktyki
 * i reguły eksperymentalne, m.in. `focus-order-semantics`).
 *
 * Czego ten test NIE sprawdza: kontrastu (jsdom nie liczy stylów Tailwinda — pilnuje tego
 * `lib/kontrast-tokenow.spec.ts` na tokenach) i przejścia czytnikiem ekranu (ręcznie).
 *
 * Akcje serwera (`'use server'`) są zastąpione atrapą: nazwa eksportu → odpowiedź z `DANE`,
 * reszta nigdy się nie rozwiązuje (komponent zostaje w stanie „wczytywanie” — też audytowany).
 */

const SRC = join(__dirname, '..');
function modulySerwera(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return modulySerwera(p);
    return /\.tsx?$/.test(n) && !n.includes('.spec.') && /^\s*['"]use server['"]/.test(readFileSync(p, 'utf8')) ? [p] : [];
  });
}
for (const plik of modulySerwera(SRC)) {
  jest.doMock(plik, () => {
    const { DANE } = jest.requireActual<typeof import('./dane-widokow')>('./dane-widokow');
    return new Proxy(
      {},
      {
        get: (_t, nazwa) => {
          if (nazwa === '__esModule') return true;
          if (typeof nazwa !== 'string' || nazwa === 'then' || nazwa === 'default') return undefined;
          const dane = DANE[nazwa];
          return (...a: never[]) => (dane ? dane(...a) : new Promise(() => {}));
        },
      },
    );
  });
}

let mockZapytanie = '';
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 's1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/dashboard/services/s1',
  useSearchParams: () => new URLSearchParams(mockZapytanie),
  redirect: jest.fn(),
}));

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  fetch: () => new Promise(() => {}),
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
// axe sprawdza ligatury ikon na <canvas>; jsdom go nie ma i tylko hałasuje w logu.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// [nazwa, zakładka, teksty z danych przykładowych, które widać dopiero po wczytaniu całego widoku]
const WIDOKI: [string, string, string[]][] = [
  ['przegląd usługi', '', ['domena główna', 'ftp.kowalski.pl']],
  ['poczta', 'mail', ['jan@kowalski.pl', 'sklep@kowalski.pl', 'urlop@kowalski.pl']],
  ['bazy danych', 'databases', ['kowalski1_sklep']],
  ['pliki', 'files', ['kopia.zip']],
  ['domeny i DNS', 'domains', ['10 mail.kowalski.pl.', 'blog.kowalski.pl', 'kowalski.com.pl']],
];

// Pierwszy test w pliku kompiluje całe drzewo modułów strony usługi (ts-jest) — na wolnym runnerze CI
// to kilka sekund, więcej niż domyślne 5 s Jesta. Import rozgrzewa beforeAll z własnym limitem.
jest.setTimeout(30_000);
beforeAll(async () => {
  await import('@/app/dashboard/services/[id]/page');
}, 120_000);

let root: Root | null = null;
let kontener: HTMLElement;

/**
 * Czeka, aż widok pokaże wszystkie `teksty` (dane z akcji → setState → kolejne efekty, np. strefa DNS
 * po liście domen). Stała liczba tur zdarzeń nie wystarczała na wolnym runnerze CI — audyt szedł
 * wtedy po niedociągniętym widoku albo nie znajdował wierszy.
 */
async function czekajNa(teksty: string[], limitMs = 15_000) {
  const start = Date.now();
  const brakujace = () => teksty.filter((t) => !kontener.textContent?.includes(t));
  while (brakujace().length) {
    if (Date.now() - start > limitMs) throw new Error(`Widok nie pokazał: ${brakujace().join(', ')}`);
    await act(async () => new Promise((r) => setTimeout(r, 20)));
  }
}

async function pokazWidok(tab: string) {
  mockZapytanie = `kind=HOSTING${tab ? `&tab=${tab}` : ''}`;
  const { createRoot } = jest.requireActual<typeof import('react-dom/client')>('react-dom/client');
  // Import dopiero tutaj — po `jest.doMock` akcji serwera (statyczny import wszedłby przed atrapy).
  const { default: Strona } = await import('@/app/dashboard/services/[id]/page');
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
  await act(async () => root!.render(<Strona />));
  await czekajNa(WIDOKI.find(([, t]) => t === tab)![2]);
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function naruszenia(el: Element) {
  const wynik = await axe.run(el, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice', 'experimental'],
    rules: { 'color-contrast': { enabled: false } },
  });
  return wynik.violations.map((v) => ({ regula: v.id, opis: v.help, elementy: v.nodes.map((n) => n.html.slice(0, 160)) }));
}

/**
 * Przycisk z samą ikoną: nazwa z `aria-label` (sam `title` czytniki traktują różnie, a na dotyku
 * i przy fokusie klawiatury podpowiedź się nie pokazuje) i niepowtarzalna w widoku — „Usuń” przy
 * każdym wierszu na liście przycisków czytnika nie mówi, CO zostanie usunięte (WCAG 2.4.6).
 */
function przyciskiIkony(el: Element) {
  const ikony = [...el.querySelectorAll('button')].filter((b) => !b.textContent?.trim());
  const bezEtykiety = ikony.filter((b) => !b.getAttribute('aria-label')?.trim() && !b.getAttribute('aria-labelledby')).map((b) => b.outerHTML.slice(0, 120));
  const nazwy = ikony.map((b) => b.getAttribute('aria-label')?.trim()).filter((n): n is string => !!n);
  const powtorzone = [...new Set(nazwy.filter((n, i) => nazwy.indexOf(n) !== i))];
  return { bezEtykiety, powtorzone };
}

/**
 * Pole formularza z nazwą z etykiety lub aria-label, nie z samego `placeholder` — axe przyjmuje
 * placeholder jako nazwę, ale znika on po wpisaniu pierwszego znaku (WCAG 3.3.2, 4.1.2).
 */
function polaBezEtykiety(el: Element) {
  return [...el.querySelectorAll<HTMLInputElement>('input, textarea, select')]
    .filter((p) => !p.hidden && p.type !== 'hidden')
    .filter((p) => !p.labels?.length && !p.getAttribute('aria-label')?.trim() && !p.getAttribute('aria-labelledby'))
    .map((p) => p.outerHTML.slice(0, 120));
}

describe.each(WIDOKI)('widok: %s', (_nazwa, tab) => {
  it('axe: brak naruszeń WCAG 2.1 A/AA i dobrych praktyk', async () => {
    await pokazWidok(tab);
    expect(kontener.textContent).not.toContain('Wczytywanie…');
    expect(await naruszenia(kontener)).toEqual([]);
  });

  it('przyciski z samą ikoną mają własną, niepowtarzalną etykietę', async () => {
    await pokazWidok(tab);
    expect(przyciskiIkony(kontener)).toEqual({ bezEtykiety: [], powtorzone: [] });
  });

  it('pola formularzy mają etykietę, nie tylko placeholder', async () => {
    await pokazWidok(tab);
    expect(polaBezEtykiety(kontener)).toEqual([]);
  });
});

describe('okno potwierdzenia (usunięcie bazy)', () => {
  async function otworz() {
    await pokazWidok('databases');
    const usun = kontener.querySelector<HTMLButtonElement>('button[aria-label="Usuń bazę kowalski1_wp"]');
    expect(usun).not.toBeNull();
    usun!.focus();
    await act(async () => usun!.click());
    const okno = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(okno).not.toBeNull();
    return { usun: usun!, okno: okno! };
  }

  it('axe: brak naruszeń, fokus w oknie', async () => {
    const { okno } = await otworz();
    expect(okno.contains(document.activeElement)).toBe(true);
    expect(await naruszenia(okno)).toEqual([]);
  });

  it('Tab nie wychodzi z okna (2.4.3), Esc zamyka i oddaje fokus przyciskowi', async () => {
    const { usun, okno } = await otworz();
    const przyciski = [...okno.querySelectorAll('button')];
    const ostatni = przyciski[przyciski.length - 1];
    ostatni.focus();
    act(() => {
      ostatni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(przyciski[0]);
    act(() => {
      przyciski[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(ostatni);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(usun);
  });
});

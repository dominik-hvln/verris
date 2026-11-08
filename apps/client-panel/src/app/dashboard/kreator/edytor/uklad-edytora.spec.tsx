/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { PLANY_KREATORA, type Strona } from '@verris/kreator/klient';
import type { StanKreatora, WidokStronyKreatora } from '@/lib/kreator';
import { DostawcaSkupienia } from '@/components/panel/tryb-skupienia';
import { Edytor } from './edytor';
import { Podglad, PROG_SKALI_KOMPUTERA, widokPodgladu } from './podglad';
import { ukladDlaSzerokosci } from './uklad';

/**
 * Paczka 121 – edytor kreatora na mniejszych ekranach: tryb skupienia (pasek z „← Panel” zamiast menu panelu),
 * szuflady jako dialogi (Esc, fokus), zakładki na telefonie, automatyczny podgląd telefonu przy wąskiej kolumnie.
 * Brak CSS w jsdom: widoczność paneli sprawdzamy po klasach zakresów (max-md: – telefon).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
globalThis.structuredClone ??= <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));
jest.mock('../akcje', () => ({
  zapiszModel: jest.fn(),
  zmienNazweStrony: jest.fn(),
  polecenieAi: jest.fn(),
  przywrocWersje: jest.fn(),
  wybierzPropozycje: jest.fn(),
  wersjeStrony: jest.fn(() => new Promise(() => undefined)),
  stanPublikacji: jest.fn(() => new Promise(() => undefined)),
  opublikuj: jest.fn(),
  wycofajPublikacje: jest.fn(),
}));

/** Szerokość okna dla matchMedia (`(max-width: Npx)`) – jsdom nie ma matchMedia. */
let szerokoscOkna = 1600;
function ustawOkno(w: number) {
  szerokoscOkna = w;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => {
      const m = /max-width:\s*([\d.]+)px/.exec(q);
      return { matches: m ? szerokoscOkna <= Number(m[1]) : false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined };
    },
  });
}

/** Szerokość kolumny podglądu (clientWidth kontenera) i ręczne wywołanie ResizeObserver. */
let szerokoscKolumny = 800;
const obserwatory: (() => void)[] = [];
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => szerokoscKolumny });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
      obserwatory.push(cb);
    }
    observe() {}
    disconnect() {}
  };
  // Podgląd wysyła ukryty formularz do ramki – w jsdom bez nawigacji.
  HTMLFormElement.prototype.submit = jest.fn();
});

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  szerokoscKolumny = 800;
  obserwatory.length = 0;
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

const model = () => structuredClone(PRZYKLAD_SALON) as unknown as Strona;
const widok = (): WidokStronyKreatora =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    nazwa: 'Salon Ola',
    status: 'GOTOWA',
    bladOpis: null,
    branza: 'salon fryzjerski',
    model: model(),
    propozycje: [],
    zmianyBezPro: [],
    opublikowanaAt: null,
    domena: null,
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
  }) as unknown as WidokStronyKreatora;
const stan = (): StanKreatora =>
  ({
    dostep: true,
    powod: null,
    wersja: 'hosting',
    plan: PLANY_KREATORA.hosting,
    zuzycie: { miesiac: '2026-11', generacje: 1, zmiany: 0, stron: 1 },
    korzysciPro: [],
    cenaPro: { miesiacBrutto: 9.9, miesiacNetto: 8.05, rokBrutto: 99, rokNetto: 80.49 },
    katalog: { warianty: {}, efekty: [], sekcjePro: [] },
  }) as unknown as StanKreatora;

const przycisk = (nazwa: string, w: ParentNode = el) =>
  [...w.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === nazwa)!;
const struktura = () => el.querySelector<HTMLElement>('#kr-struktura')!;
const edycja = () => el.querySelector<HTMLElement>('#kr-edycja')!;
const podglad = () => el.querySelector<HTMLElement>('#kr-podglad')!;
const naTelefonie = (x: HTMLElement) => !x.className.split(/\s+/).includes('max-md:hidden');
const klawisz = async (key: string) =>
  act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
const wyrenderuj = async (zKontekstem?: { otworzMenu: jest.Mock }) =>
  act(async () =>
    root.render(
      zKontekstem ? (
        <DostawcaSkupienia value={{ otworzMenu: zKontekstem.otworzMenu, menuOtwarte: false, idMenu: 'menu-panelu' }}>
          <Edytor widok={widok()} stan={stan()} />
        </DostawcaSkupienia>
      ) : (
        <Edytor widok={widok()} stan={stan()} />
      ),
    ),
  );

describe('układ według szerokości', () => {
  it('progi: < 768 telefon, 768–1023 wąski, 1024–1439 średni, ≥ 1440 szeroki', () => {
    expect([360, 767, 768, 1023, 1024, 1439, 1440].map(ukladDlaSzerokosci)).toEqual(['telefon', 'telefon', 'waski', 'waski', 'sredni', 'sredni', 'szeroki']);
  });
});

describe('pasek edytora (tryb skupienia)', () => {
  it('„← Panel” prowadzi do listy stron; bez layoutu panelu nie ma „Menu”', async () => {
    ustawOkno(1600);
    await wyrenderuj();
    const powrot = el.querySelector<HTMLAnchorElement>('a[aria-label="Wróć do listy stron w panelu"]')!;
    expect(powrot.getAttribute('href')).toBe('/dashboard/kreator');
    expect(przycisk('Menu panelu')).toBeUndefined();
    expect(el.querySelector('h1')?.textContent).toBe('Edytor strony „Salon Ola”');
  });

  it('w layoucie panelu „Menu” otwiera menu panelu z przyciskiem jako wyzwalaczem fokusu', async () => {
    ustawOkno(1600);
    const otworzMenu = jest.fn();
    await wyrenderuj({ otworzMenu });
    const menu = przycisk('Menu panelu');
    await act(async () => menu.click());
    expect(otworzMenu).toHaveBeenCalledWith(menu);
  });
});

describe('szuflady (768–1439 px)', () => {
  it('„Sekcje”: dialog z fokusem, Esc zamyka i oddaje fokus przyciskowi', async () => {
    ustawOkno(1200);
    await wyrenderuj();
    expect(struktura().getAttribute('role')).toBeNull();
    const sekcje = przycisk('Sekcje');
    sekcje.focus();
    await act(async () => sekcje.click());
    expect(struktura().getAttribute('role')).toBe('dialog');
    expect(struktura().getAttribute('aria-modal')).toBe('true');
    expect(sekcje.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(struktura());
    // Tab nie wychodzi z szuflady: z ostatniego elementu wraca na pierwszy.
    const fokusowalne = [...struktura().querySelectorAll<HTMLElement>('button:not([disabled])')];
    fokusowalne[fokusowalne.length - 1]!.focus();
    await klawisz('Tab');
    expect(document.activeElement).toBe(fokusowalne[0]);

    await klawisz('Escape');
    expect(struktura().getAttribute('role')).toBeNull();
    expect(struktura().className).toContain('md:max-[90rem]:hidden');
    expect(document.activeElement).toBe(sekcje);
  });

  it('768–1023: wybór sekcji z listy zamyka „Sekcje” i otwiera panel edycji jako dialog', async () => {
    ustawOkno(900);
    await wyrenderuj();
    await act(async () => przycisk('Sekcje').click());
    const oferta = [...struktura().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.startsWith('Oferta'))!;
    await act(async () => oferta.click());
    expect(struktura().getAttribute('role')).toBeNull();
    expect(edycja().getAttribute('role')).toBe('dialog');
    expect(edycja().getAttribute('aria-label')).toBe('Edycja');
    expect(edycja().contains(document.activeElement)).toBe(true);
    await act(async () => przycisk('Zamknij panel edycji').click());
    expect(edycja().getAttribute('role')).toBeNull();
  });

  it('≥ 1440: struktura i edycja są kolumnami – bez dialogów po wyborze sekcji', async () => {
    ustawOkno(1600);
    await wyrenderuj();
    const oferta = [...struktura().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.startsWith('Oferta'))!;
    await act(async () => oferta.click());
    expect(oferta.getAttribute('aria-pressed')).toBe('true');
    expect(struktura().getAttribute('role')).toBeNull();
    expect(edycja().getAttribute('role')).toBeNull();
  });
});

describe('telefon (< 768 px): zakładki na dole ekranu', () => {
  it('jeden panel naraz: domyślnie podgląd; „Sekcje”, „Edytuj”, „AI” przełączają panel', async () => {
    ustawOkno(390);
    await wyrenderuj();
    const nav = el.querySelector<HTMLElement>('nav[aria-label="Widok edytora"]')!;
    const z = (n: string) => przycisk(n, nav);
    expect(z('Podgląd').getAttribute('aria-pressed')).toBe('true');
    expect([naTelefonie(struktura()), naTelefonie(podglad()), naTelefonie(edycja())]).toEqual([false, true, false]);

    await act(async () => z('Sekcje').click());
    expect(z('Sekcje').getAttribute('aria-pressed')).toBe('true');
    expect([naTelefonie(struktura()), naTelefonie(podglad()), naTelefonie(edycja())]).toEqual([true, false, false]);

    await act(async () => z('AI').click());
    expect(z('AI').getAttribute('aria-pressed')).toBe('true');
    expect(naTelefonie(edycja())).toBe(true);
    expect(document.getElementById('kr-tab-ai')?.getAttribute('aria-selected')).toBe('true');

    await act(async () => z('Edytuj').click());
    expect(z('Edytuj').getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('kr-tab-sekcja')?.getAttribute('aria-selected')).toBe('true');
  });

  it('wybór sekcji na liście przechodzi do „Edytuj”; skip link „Przejdź do podglądu” wraca do podglądu', async () => {
    ustawOkno(390);
    await wyrenderuj();
    const nav = el.querySelector<HTMLElement>('nav[aria-label="Widok edytora"]')!;
    await act(async () => przycisk('Sekcje', nav).click());
    const oferta = [...struktura().querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.startsWith('Oferta'))!;
    await act(async () => oferta.click());
    expect(przycisk('Edytuj', nav).getAttribute('aria-pressed')).toBe('true');
    expect(struktura().getAttribute('role')).toBeNull();

    const skip = [...el.querySelectorAll('a')].find((a) => a.textContent === 'Przejdź do podglądu')!;
    await act(async () => skip.click());
    expect(przycisk('Podgląd', nav).getAttribute('aria-pressed')).toBe('true');
  });

  it('„Więcej”: Historia i „Pokaż funkcje Pro” w menu; Esc zamyka i oddaje fokus', async () => {
    ustawOkno(390);
    const otworzMenu = jest.fn();
    await wyrenderuj({ otworzMenu });
    const wiecej = przycisk('Więcej');
    await act(async () => wiecej.click());
    const menu = el.querySelector<HTMLElement>('#kr-wiecej')!;
    expect(wiecej.getAttribute('aria-expanded')).toBe('true');
    expect(przycisk('Historia wersji', menu)).toBeDefined();
    expect(menu.querySelector('[role="switch"][aria-label="Pokaż funkcje Pro w podglądzie"]')).not.toBeNull();
    await act(async () => przycisk('Menu panelu', menu).click());
    expect(otworzMenu).toHaveBeenCalledWith(wiecej);
    expect(el.querySelector('#kr-wiecej')).toBeNull();

    await act(async () => wiecej.click());
    await klawisz('Escape');
    expect(el.querySelector('#kr-wiecej')).toBeNull();
    expect(document.activeElement).toBe(wiecej);
  });
});

describe('podgląd: automatyczny telefon przy wąskiej kolumnie', () => {
  it('próg skali 0,5: kolumna 639 px → telefon, 640 px → komputer; wybór „Telefon” bez zmian', () => {
    expect(PROG_SKALI_KOMPUTERA).toBe(0.5);
    expect(widokPodgladu('komputer', 639)).toEqual({ urzadzenie: 'telefon', zaWasko: true });
    expect(widokPodgladu('komputer', 640)).toEqual({ urzadzenie: 'komputer', zaWasko: false });
    expect(widokPodgladu('komputer', 0)).toEqual({ urzadzenie: 'komputer', zaWasko: false });
    expect(widokPodgladu('telefon', 300)).toEqual({ urzadzenie: 'telefon', zaWasko: false });
  });

  it('zwężenie kolumny (ResizeObserver) przełącza na telefon z informacją i przyciskiem pełnego ekranu', async () => {
    const pelny = jest.fn();
    await act(async () =>
      root.render(<Podglad model={model()} podstrona="" pro={false} zaznaczona={null} przewinDo={null} urzadzenie="komputer" onPelnyEkran={pelny} onWiadomosc={jest.fn()} />),
    );
    const ramka = () => el.querySelector<HTMLElement>('[data-urzadzenie]')!;
    expect(ramka().dataset.urzadzenie).toBe('komputer');
    expect(el.querySelector('[data-podglad-auto-telefon]')).toBeNull();
    // Skala 800/1280 = 0,625 – iframe 1280 px pomniejszony.
    expect(el.querySelector('iframe')!.style.transform).toBe('scale(0.625)');

    szerokoscKolumny = 500;
    await act(async () => obserwatory.forEach((cb) => cb()));
    expect(ramka().dataset.urzadzenie).toBe('telefon');
    expect(el.querySelector('iframe')!.style.width).toBe('390px');
    const info = el.querySelector<HTMLElement>('[data-podglad-auto-telefon]')!;
    expect(info.textContent).toContain('Za mało miejsca na czytelny widok komputera');
    await act(async () => info.querySelector('button')!.click());
    expect(pelny).toHaveBeenCalled();
  });

  it('telefon (390 px): edytor od razu pokazuje podgląd telefonu; pełny ekran to dialog z ramką 100%', async () => {
    ustawOkno(390);
    szerokoscKolumny = 390;
    await wyrenderuj();
    expect(podglad().querySelector<HTMLElement>('[data-urzadzenie]')!.dataset.urzadzenie).toBe('telefon');
    await act(async () => (podglad().querySelector('[data-podglad-auto-telefon] button') as HTMLButtonElement).click());
    const dialog = el.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="kr-pelny-tytul"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    expect(dialog.querySelector<HTMLElement>('[data-urzadzenie]')!.dataset.urzadzenie).toBe('komputer');
    expect(dialog.querySelector('iframe')!.style.transform).toBe('scale(1)');
    // Dwie ramki naraz – każda z własnym celem formularza.
    const nazwy = [...el.querySelectorAll('iframe')].map((f) => f.name);
    expect(new Set(nazwy).size).toBe(2);
    await klawisz('Escape');
    expect(el.querySelector('[aria-labelledby="kr-pelny-tytul"]')).toBeNull();
  });
});

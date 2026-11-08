/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { PLANY_KREATORA, Strona } from '@verris/kreator/klient';
import type { StanKreatora, WidokStronyKreatora } from '@/lib/kreator';
import { Edytor, wPoluTekstowym } from './edytor';
import { odczytajWiadomoscEdycji } from './podglad';
import { SCALANIE_MS, StosZmian } from './cofanie';

/**
 * Paczka 122 – edycja na stronie w edytorze: odbiór wiadomości mostka (źródło = nasza ramka, v:1, ścieżka pola
 * z modelu), zmiana z ramki bez przeładowania ramki, polecenia paska sekcji, telefon → fokus pola formularza,
 * cofanie lokalne (Ctrl/Cmd+Z, także skrót z ramki).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
globalThis.structuredClone ??= <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => {
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    return createElement('a', { href, ...r }, children);
  },
}));
jest.mock('../akcje', () => ({
  zapiszModel: jest.fn(() => new Promise(() => undefined)),
  zmienNazweStrony: jest.fn(),
  polecenieAi: jest.fn(),
  przywrocWersje: jest.fn(),
  wybierzPropozycje: jest.fn(),
  wersjeStrony: jest.fn(() => new Promise(() => undefined)),
  stanPublikacji: jest.fn(() => new Promise(() => undefined)),
  opublikuj: jest.fn(),
  wycofajPublikacje: jest.fn(),
}));
// Okno wyboru zdjęcia (agent zdjęć) – tu tylko jego kontrakt: props i onWybierz.
jest.mock(
  './zdjecia/wybor-zdjecia',
  () => ({
    WyborZdjecia: (p: { sciezka: string; stronaId: string; otwarty: boolean; onWybierz: (o: unknown) => void; onZamknij: () => void }) => {
      const { createElement } = jest.requireActual<typeof import('react')>('react');
      if (!p.otwarty) return null;
      return createElement(
        'div',
        { 'data-wybor-zdjecia': p.sciezka, 'data-strona': p.stronaId },
        createElement('button', { type: 'button', onClick: () => p.onWybierz({ alt: 'Nowe wnętrze', zrodlo: 'wlasne', url: 'assets/img/nowe.jpg', proporcje: '4:3' }) }, 'Wybierz testowe'),
      );
    },
  }),
);

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

const wyslane: { model: Strona; edycja: string; zaznaczona: string }[] = [];
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  // Podgląd wysyła ukryty formularz do ramki – zapisujemy, co poszło (jsdom nie nawiguje).
  HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    const pole = (n: string) => (this.elements.namedItem(n) as HTMLInputElement).value;
    wyslane.push({ model: JSON.parse(pole('model')) as Strona, edycja: pole('edycja'), zaznaczona: pole('zaznaczona') });
  };
});

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  jest.useFakeTimers();
  wyslane.length = 0;
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  jest.useRealTimers();
});

const widok = (): WidokStronyKreatora =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    nazwa: 'Salon Ola',
    status: 'GOTOWA',
    bladOpis: null,
    branza: 'salon fryzjerski',
    // Model jak z API – po walidacji (wartości domyślne uzupełnione, np. seo podstrony).
    model: Strona.parse(structuredClone(PRZYKLAD_SALON)),
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

const czekaj = async (ms = 600) => act(async () => void jest.advanceTimersByTime(ms));
async function wyrenderuj() {
  await act(async () => root.render(<Edytor widok={widok()} stan={stan()} />));
  await czekaj();
}
const ramka = () => el.querySelector<HTMLIFrameElement>('#kr-podglad iframe')!;
async function zRamki(dane: unknown, zrodlo: MessageEventSource | null = ramka().contentWindow) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: dane, source: zrodlo }));
  });
}
const pole = (sciezka: string) => [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-sciezka]')].find((e) => e.dataset.sciezka === sciezka);
const stanZapisu = () => el.querySelector('[role="status"]')!.textContent ?? '';
const PODTYTUL = 'strony.0.sekcje.0.dane.podtytul';
const NAGLOWEK = 'strony.0.sekcje.0.dane.naglowek';

describe('odczyt wiadomości mostka', () => {
  it('tylko v:1 i znane kształty; ścieżki i identyfikatory sekcji ze wzorca', () => {
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'x' })).toEqual({ typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'x' });
    expect(odczytajWiadomoscEdycji({ typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'x' })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 2, typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'x' })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'tekst', sciezka: 'a/../b', wartosc: 'x' })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'tekst', sciezka: NAGLOWEK, wartosc: { html: 1 } })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'polecenie', sekcja: 'start', polecenie: 'usun' })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'zaznacz', sekcja: 'Start"><' })).toBeNull();
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'skrot', skrot: 'cofnij' })).toEqual({ typ: 'skrot', skrot: 'cofnij' });
    expect(odczytajWiadomoscEdycji({ v: 1, typ: 'nieznany' })).toBeNull();
  });
});

describe('edycja na stronie – komputer', () => {
  beforeEach(() => ustawOkno(1600));

  it('ramka ładuje się w trybie edycji; tekst z ramki trafia do modelu i formularza BEZ przeładowania ramki', async () => {
    await wyrenderuj();
    expect(wyslane).toHaveLength(1);
    expect(wyslane[0]!.edycja).toBe('1');
    await zRamki({ v: 1, typ: 'tekst', sciezka: PODTYTUL, wartosc: 'Nowy podtytuł z podglądu' });
    expect(pole(PODTYTUL)!.value).toBe('Nowy podtytuł z podglądu');
    expect(stanZapisu()).toContain('Niezapisane');
    await czekaj();
    expect(wyslane).toHaveLength(1);
    // Zmiana z formularza – ramka się przeładowuje (z nowym tekstem).
    await act(async () => {
      const p = pole(PODTYTUL)!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(p, 'Z formularza');
      p.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await czekaj();
    expect(wyslane).toHaveLength(2);
    expect((wyslane[1]!.model.strony[0]!.sekcje[0]!.dane as { podtytul: string }).podtytul).toBe('Z formularza');
  });

  it('odrzuca: obce źródło, brak v:1, pole techniczne/SEO, nieistniejące pole; pusty wymagany – tekst wraca do ramki', async () => {
    await wyrenderuj();
    const doRamki = jest.spyOn(ramka().contentWindow!, 'postMessage');
    await zRamki({ v: 1, typ: 'tekst', sciezka: PODTYTUL, wartosc: 'Obce okno' }, window);
    await zRamki({ typ: 'tekst', sciezka: PODTYTUL, wartosc: 'Bez wersji' });
    await zRamki({ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.0.dane.przyciski.0.cel', wartosc: 'javascript:void(0)' });
    await zRamki({ v: 1, typ: 'tekst', sciezka: 'seo.tytul', wartosc: 'SEO z ramki' });
    await zRamki({ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.0.dane.nieMa', wartosc: 'x' });
    await zRamki({ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.0.dane.obraz.alt', wartosc: 'x' });
    expect(stanZapisu()).toContain('Zapisano');
    await zRamki({ v: 1, typ: 'tekst', sciezka: NAGLOWEK, wartosc: '   ' });
    expect(pole(NAGLOWEK)!.value).toBe(PRZYKLAD_SALON.strony[0]!.sekcje[0]!.dane.naglowek as string);
    expect(doRamki).toHaveBeenCalledWith({ v: 1, typ: 'tekst-z-zewnatrz', sciezka: NAGLOWEK, wartosc: PRZYKLAD_SALON.strony[0]!.sekcje[0]!.dane.naglowek }, '*');
    expect(stanZapisu()).toContain('Zapisano');
  });

  it('tekst za długi – przycięty do limitu ze schematu, ramka dostaje wersję z modelu', async () => {
    await wyrenderuj();
    const doRamki = jest.spyOn(ramka().contentWindow!, 'postMessage');
    await zRamki({ v: 1, typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'x'.repeat(400) });
    expect(pole(NAGLOWEK)!.value).toHaveLength(140);
    expect(doRamki).toHaveBeenCalledWith({ v: 1, typ: 'tekst-z-zewnatrz', sciezka: NAGLOWEK, wartosc: 'x'.repeat(140) }, '*');
  });

  it('nagłówek bez wyróżnionego fragmentu: wyróżnienie znika, ramka się przerysowuje', async () => {
    await wyrenderuj();
    await zRamki({ v: 1, typ: 'tekst', sciezka: NAGLOWEK, wartosc: 'Dobre cięcie bez niczego' });
    await czekaj();
    expect(wyslane).toHaveLength(2);
    expect((wyslane[1]!.model.strony[0]!.sekcje[0]!.dane as { wyroznienie?: string }).wyroznienie).toBeUndefined();
  });

  it('zaznaczenie z ramki: bez przeładowania, ramka dostaje „zaznaczono”; polecenia paska → akcje edytora', async () => {
    await wyrenderuj();
    const doRamki = jest.spyOn(ramka().contentWindow!, 'postMessage');
    await zRamki({ v: 1, typ: 'zaznacz', sekcja: 'pytania' });
    expect(doRamki).toHaveBeenCalledWith({ v: 1, typ: 'zaznaczono', sekcja: 'pytania' }, '*');
    await czekaj();
    expect(wyslane).toHaveLength(1);
    await zRamki({ v: 1, typ: 'polecenie', sekcja: 'pytania', polecenie: 'w-gore' });
    await czekaj();
    const kolejnosc = (m: Strona) => m.strony[0]!.sekcje.map((s) => s.id);
    const przed = kolejnosc(PRZYKLAD_SALON as unknown as Strona);
    const ip = przed.indexOf('pytania');
    expect(kolejnosc(wyslane.at(-1)!.model).indexOf('pytania')).toBe(ip - 1);
    await zRamki({ v: 1, typ: 'polecenie', sekcja: 'pytania', polecenie: 'ukryj' });
    await czekaj();
    expect(wyslane.at(-1)!.model.strony[0]!.sekcje.find((s) => s.id === 'pytania')!.ukryta).toBe(true);
    await zRamki({ v: 1, typ: 'polecenie', sekcja: 'start', polecenie: 'ai' });
    expect(el.querySelector('#kr-tab-ai')!.getAttribute('aria-selected')).toBe('true');
    // Cena liczbowa: „opcje” ze ścieżką pola sekcji otwiera formularz z fokusem na tym polu.
    await zRamki({ v: 1, typ: 'polecenie', sekcja: 'start', polecenie: 'opcje', sciezka: PODTYTUL });
    await czekaj(100);
    expect(el.querySelector('#kr-tab-sekcja')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pole(PODTYTUL));
  });

  it('obraz z ramki otwiera wybór zdjęcia dla tej ścieżki; wybrane zdjęcie trafia do modelu', async () => {
    await wyrenderuj();
    await zRamki({ v: 1, typ: 'obraz', sciezka: 'strony.0.sekcje.0.dane.przyciski.0' });
    expect(el.querySelector('[data-wybor-zdjecia]')).toBeNull();
    await zRamki({ v: 1, typ: 'obraz', sciezka: 'strony.0.sekcje.0.dane.obraz' });
    const okno = el.querySelector('[data-wybor-zdjecia]')!;
    expect(okno.getAttribute('data-wybor-zdjecia')).toBe('strony.0.sekcje.0.dane.obraz');
    expect(okno.getAttribute('data-strona')).toBe(widok().id);
    await act(async () => okno.querySelector('button')!.click());
    expect(el.querySelector('[data-wybor-zdjecia]')).toBeNull();
    await czekaj();
    expect((wyslane.at(-1)!.model.strony[0]!.sekcje[0]!.dane as { obraz: { url: string } }).obraz.url).toBe('assets/img/nowe.jpg');
  });

  it('cofanie lokalne: Ctrl+Z i Shift+Ctrl+Z (także skrót z ramki); w polu tekstowym Ctrl+Z należy do przeglądarki', async () => {
    await wyrenderuj();
    await zRamki({ v: 1, typ: 'tekst', sciezka: PODTYTUL, wartosc: 'Pierwsza zmiana' });
    await act(async () => void jest.advanceTimersByTime(SCALANIE_MS + 10));
    await zRamki({ v: 1, typ: 'tekst', sciezka: PODTYTUL, wartosc: 'Druga zmiana' });
    const klawisz = (opcje: KeyboardEventInit, cel: EventTarget = document.body) =>
      act(async () => void cel.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opcje })));
    await klawisz({ key: 'z', ctrlKey: true });
    expect(pole(PODTYTUL)!.value).toBe('Pierwsza zmiana');
    await zRamki({ v: 1, typ: 'skrot', skrot: 'cofnij' });
    expect(pole(PODTYTUL)!.value).toBe(PRZYKLAD_SALON.strony[0]!.sekcje[0]!.dane.podtytul);
    await klawisz({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(pole(PODTYTUL)!.value).toBe('Pierwsza zmiana');
    await klawisz({ key: 'z', metaKey: true, shiftKey: true });
    expect(pole(PODTYTUL)!.value).toBe('Druga zmiana');
    // Cofnięcie zmienia model spoza ramki – ramka się przeładowuje.
    const ile = wyslane.length;
    await klawisz({ key: 'z', ctrlKey: true }, pole(PODTYTUL)!);
    expect(pole(PODTYTUL)!.value).toBe('Druga zmiana');
    await klawisz({ key: 'z', ctrlKey: true });
    await czekaj();
    expect(wyslane.length).toBe(ile + 1);
    // Ponowienie zmiany, która przyszła z ramki: ramka pokazuje już stan po cofnięciu – musi się przeładować.
    await klawisz({ key: 'y', ctrlKey: true });
    await czekaj();
    expect(wyslane.length).toBe(ile + 2);
    expect((wyslane.at(-1)!.model.strony[0]!.sekcje[0]!.dane as { podtytul: string }).podtytul).toBe('Druga zmiana');
    expect(wPoluTekstowym(pole(PODTYTUL)!)).toBe(true);
  });

  it('przełącznik „Edycja na stronie” wyłącza mostek (zwykły podgląd)', async () => {
    await wyrenderuj();
    const przelacznik = el.querySelector<HTMLElement>('[role="switch"][aria-label^="Edycja na stronie"]')!;
    expect(przelacznik.getAttribute('aria-checked')).toBe('true');
    await act(async () => przelacznik.click());
    await czekaj();
    expect(wyslane.at(-1)!.edycja).toBe('');
  });
});

describe('edycja na stronie – telefon (< 768 px)', () => {
  beforeEach(() => ustawOkno(390));

  it('ramka w trybie „zaznacz”; stuknięcie w tekst otwiera zakładkę „Edytuj” z fokusem na tym polu', async () => {
    await wyrenderuj();
    expect(wyslane[0]!.edycja).toBe('zaznacz');
    const edycja = el.querySelector<HTMLElement>('#kr-edycja')!;
    expect(edycja.className).toContain('max-md:hidden');
    await zRamki({ v: 1, typ: 'zaznacz', sekcja: 'pytania', sciezka: 'strony.0.sekcje.4.dane.pytania.0.pytanie' });
    await czekaj(100);
    expect(edycja.className).not.toContain('max-md:hidden');
    expect(el.querySelector('#kr-tab-sekcja')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pole('strony.0.sekcje.4.dane.pytania.0.pytanie'));
    // Dane firmy – zakładka „Firma i SEO”.
    await zRamki({ v: 1, typ: 'zaznacz', sekcja: 'start', sciezka: 'firma.nazwa' });
    await czekaj(100);
    expect(el.querySelector('#kr-tab-seo')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pole('firma.nazwa'));
  });
});

describe('stos cofania', () => {
  it('scala szybkie zmiany jednego pola, czyści ponowienie po nowej zmianie, ma limit', () => {
    let t = 0;
    const s = new StosZmian<number>(() => t);
    s.zapisz(0, 'a');
    t += 100;
    s.zapisz(1, 'a');
    t += SCALANIE_MS + 1;
    s.zapisz(2, 'a');
    s.zapisz(3, 'b');
    expect(s.cofnij(4)).toBe(3);
    expect(s.cofnij(3)).toBe(2);
    expect(s.cofnij(2)).toBe(0);
    expect(s.cofnij(0)).toBeNull();
    expect(s.ponow(0)).toBe(2);
    s.zapisz(2, 'c');
    expect(s.ponow(9)).toBeNull();
    for (let i = 0; i < 150; i++) s.zapisz(i);
    let ile = 0;
    while (s.cofnij(0) !== null) ile++;
    expect(ile).toBe(100);
  });
});

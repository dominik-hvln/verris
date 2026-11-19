/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { koloryMarki, type Marka, type ProjektLogo, type StanKreatoraMarki, type WidokMarki } from '@verris/kreator/klient';

const akcje = {
  wybierzKierunek: jest.fn(),
  nowaSeria: jest.fn(),
  kierunkiOdswiezenia: jest.fn(),
  zapiszZgody: jest.fn(),
  stopkaEmail: jest.fn(),
  kupMarke: jest.fn(),
  usunMarke: jest.fn(),
};
jest.mock('./akcje', () => Object.fromEntries(Object.keys({ wybierzKierunek: 1, nowaSeria: 1, kierunkiOdswiezenia: 1, zapiszZgody: 1, stopkaEmail: 1, kupMarke: 1, usunMarke: 1 }).map((k) => [k, (...a: unknown[]) => (akcje as Record<string, jest.Mock>)[k]!(...a)])));
const odswiez = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: odswiez }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
const potwierdz = jest.fn();
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));

import { TEKST_ZGODY_TMVIEW, TEKST_ZGODY_TRESCI_CYFROWEJ } from '@/lib/kreator-marki';
import { Eksport } from './eksport';
import { ListaMarek } from './lista-marek';
import { Propozycje, przewinDoDopasuj, RADA_PODOBNY_ZNAK } from './propozycje';
import { ZakupMarki } from './zakup-marki';

/**
 * Paczka 131 – kluczowe ekrany: wybór kierunku z edycją (409 PODOBNY_ZNAK z radą), eksport z blokadami (TMview →
 * potwierdzenie w API, Pakiet → zakup), zakup z obowiązkową zgodą na treść cyfrową, usunięcie marki z potwierdzeniem.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as never;

const projekt = (barwa = 240): ProjektLogo => ({
  sygnet: { typ: 'biblioteka', rodzina: 'kreg-fala', parametry: {}, ziarno: 0 },
  napis: { font: 'Fraunces', waga: 600, styl: 'jeden', rozstrzelenie: 0, podpis: true },
  kolory: koloryMarki(barwa, 'jasna'),
  uklad: 'poziomy',
  fonty: { naglowki: 'Fraunces', tekst: 'Inter' },
});
const BRIEF = { nazwa: 'Pracownia Fal', branza: 'żeglarstwo', opis: 'Kursy.', rodzaj: 'znak-i-napis' as const, cechy: [], barwyLubiane: [], barwyOdrzucone: [] };
const STAN: StanKreatoraMarki = {
  dostepny: true,
  wersja: 'hosting',
  limity: { marki: { uzyte: 1, limit: 1 }, serie: { uzyte: 1, limit: 3 }, zmianyAi: { uzyte: 0, limit: 50 } },
  pakiet: { kupiony: false, cena: { brutto: 149, netto: 121.14 }, aktualizacjeDo: null },
  drugaMarka: { cena: { brutto: 49, netto: 39.84 }, dostepna: true },
  symboleAi: true,
  maksWgraniaMb: 10,
  marki: [],
};
const MARKA: Marka = { wersjaModelu: 1, zrodlo: 'nowa', brief: BRIEF, projekt: projekt(), kv: { wzor: 'rzadki', tloCiemne: false }, kontakt: {}, zgody: {} };
const widok = (o: Partial<WidokMarki> = {}): WidokMarki => ({
  id: 'm1',
  zrodlo: 'nowa',
  etap: 'kierunki',
  wersja: 1,
  brief: BRIEF,
  serie: [
    {
      id: 's1',
      rodzaj: 'nowa',
      utworzono: '2026-11-19',
      kierunki: [
        { id: 'k1', projekt: projekt(240), dlaczego: 'Spokojna toń.', zrodloZnaku: 'biblioteka', ostrzezenia: [] },
        { id: 'k2', projekt: projekt(30), zrodloZnaku: 'ai', ostrzezenia: ['Prześwity w znaku są wąskie.'] },
      ],
    },
  ],
  marka: null,
  ocena: null,
  pliki: [],
  strony: [],
  ...o,
});

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
});
const przycisk = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(t));

describe('propozycje', () => {
  it('karty: oznaczenie znaku od AI i z biblioteki, ostrzeżenia reguł, licznik serii', async () => {
    await act(async () => root.render(<Propozycje widok={widok()} stan={{ ...STAN }} onWidok={jest.fn()} onKrok={jest.fn()} onStan={jest.fn()} />));
    expect(el.textContent).toContain('Symbol zaprojektowany przez AI dla Twojej firmy – sprawdzony walidatorem');
    expect(el.textContent).toContain('Szablon kształtu z biblioteki Verris');
    expect(el.textContent).toContain('Prześwity w znaku są wąskie.');
    expect(przycisk('Nowa seria')?.textContent).toContain('zostały 2 z 3 serii');
    expect(el.querySelectorAll('li button[aria-pressed="true"]')).toHaveLength(1);
  });

  it('wybór: bez edycji – sam kierunek; 409 PODOBNY_ZNAK – komunikat API i rada; sukces → Dopasuj', async () => {
    const onKrok = jest.fn();
    const onWidok = jest.fn();
    akcje.wybierzKierunek.mockResolvedValueOnce({ ok: false, status: 409, kod: 'PODOBNY_ZNAK', blad: 'Znak zbyt podobny do wydanego.' });
    await act(async () => root.render(<Propozycje widok={widok()} stan={STAN} onWidok={onWidok} onKrok={onKrok} onStan={jest.fn()} />));
    await act(async () => przycisk('Wybieram – zbuduj markę')!.click());
    expect(akcje.wybierzKierunek).toHaveBeenCalledWith('m1', { seriaId: 's1', kierunekId: 'k1' });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Znak zbyt podobny do wydanego.');
    expect(el.textContent).toContain(RADA_PODOBNY_ZNAK);
    expect(onKrok).not.toHaveBeenCalled();
    akcje.wybierzKierunek.mockResolvedValueOnce({ ok: true, dane: widok({ marka: MARKA }) });
    await act(async () => przycisk('Wybieram – zbuduj markę')!.click());
    expect(onKrok).toHaveBeenCalledWith('dopasuj');
    expect(onWidok).toHaveBeenCalled();
  });

  it('edycja w „Dopasuj” (układ) trafia do wyboru jako projekt', async () => {
    akcje.wybierzKierunek.mockResolvedValue({ ok: true, dane: widok({ marka: MARKA }) });
    await act(async () => root.render(<Propozycje widok={widok()} stan={STAN} onWidok={jest.fn()} onKrok={jest.fn()} onStan={jest.fn()} />));
    await act(async () => ([...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.includes('Pionowy')) as HTMLElement).click());
    await act(async () => przycisk('Wybieram – zbuduj markę')!.click());
    expect(akcje.wybierzKierunek).toHaveBeenCalledWith('m1', { seriaId: 's1', kierunekId: 'k1', projekt: expect.objectContaining({ uklad: 'pionowy' }) });
  });
});

it('telefon: wybór karty przewija do panelu „Dopasuj” i przenosi tam fokus; szeroki ekran – bez przewijania', () => {
  const panel = document.createElement('aside');
  panel.innerHTML = '<h2 tabindex="-1">Dopasuj</h2>';
  document.body.appendChild(panel);
  panel.scrollIntoView = jest.fn();
  const okno = (waski: boolean) => ({ matchMedia: (q: string) => ({ matches: q.includes('max-width') ? waski : false }) as MediaQueryList });
  expect(przewinDoDopasuj(panel, okno(false))).toBe(false);
  expect(panel.scrollIntoView).not.toHaveBeenCalled();
  expect(przewinDoDopasuj(panel, okno(true))).toBe(true);
  expect(panel.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  expect(document.activeElement?.textContent).toBe('Dopasuj');
  panel.remove();
});

describe('eksport', () => {
  const pliki = [
    { plik: 'logo-poziome-kolor.svg', grupa: 'logo' as const, opis: 'Logo SVG', dostepny: true },
    { plik: 'wizytowka.pdf', grupa: 'druk' as const, opis: 'Wizytówka', dostepny: false, blokada: 'TMVIEW_WYMAGANY' as const },
    { plik: 'post.png', grupa: 'kv' as const, opis: 'Post', dostepny: false, blokada: 'PAKIET_WYMAGANY' as const },
  ];

  it('pliki z blokadami, ZIP z liczbą dostępnych, Pakiet – rozwija zakup', async () => {
    await act(async () => root.render(<Eksport widok={widok({ marka: MARKA, pliki })} marka={MARKA} stan={STAN} strony={[]} paynowDostepny={false} onWidok={jest.fn()} onKrok={jest.fn()} />));
    const zip = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Pobierz ZIP'))!;
    expect(zip.getAttribute('href')).toBe('/api/kreator-marki/marki/m1/eksport.zip');
    expect(zip.textContent).toContain('1 plik');
    expect(el.querySelector('a[href="/api/kreator-marki/marki/m1/pliki/logo-poziome-kolor.svg"]')).not.toBeNull();
    expect(el.querySelector('a[href*="wizytowka.pdf"]')).toBeNull();
    expect(el.textContent).toContain('po sprawdzeniu w TMview');
    expect(el.textContent).toContain('w Pakiecie marki');
    await act(async () => przycisk('Pakiet marki – 149 zł brutto (121,14 zł netto)')!.click());
    expect(el.textContent).toContain(TEKST_ZGODY_TRESCI_CYFROWEJ);
    expect(el.querySelector('a[href="/dashboard/kreator/nowa"]')).not.toBeNull();
  });

  it('TMview: instrukcja z linkiem, przycisk dopiero po zaznaczeniu oświadczenia, zapis zgody w API', async () => {
    const onWidok = jest.fn();
    akcje.zapiszZgody.mockResolvedValue({ ok: true, dane: widok({ marka: MARKA }) });
    await act(async () => root.render(<Eksport widok={widok({ marka: MARKA, pliki })} marka={MARKA} stan={STAN} strony={null} paynowDostepny={false} onWidok={onWidok} onKrok={jest.fn()} />));
    expect(el.querySelector('a[href="https://www.tmdn.org/tmview/"]')).not.toBeNull();
    expect(el.textContent).toContain(TEKST_ZGODY_TMVIEW);
    const potw = przycisk('Potwierdzam')!;
    expect(potw.disabled).toBe(true);
    const box = [...el.querySelectorAll('input[type=checkbox]')].find((i) => i.closest('label')?.textContent?.includes('TMview')) as HTMLInputElement;
    await act(async () => box.click());
    await act(async () => przycisk('Potwierdzam')!.click());
    expect(akcje.zapiszZgody).toHaveBeenCalledWith('m1', { sprawdzilemTmview: true });
    expect(onWidok).toHaveBeenCalled();
  });

  it('strony z Kreatora stron: link do edytora z otwartą zakładką Motyw, stan wersji marki', async () => {
    const strony = [{ id: 's1', nazwa: 'Strona szkoły', status: 'GOTOWA' as const, bladOpis: null, branza: null, opublikowanaAt: null, domena: null, propozycji: 0, createdAt: '', updatedAt: '' }];
    await act(async () =>
      root.render(<Eksport widok={widok({ marka: MARKA, wersja: 2, strony: [{ id: 's1', nazwa: 'Strona szkoły', wersjaNaStronie: 1 }] })} marka={MARKA} stan={STAN} strony={strony} paynowDostepny={false} onWidok={jest.fn()} onKrok={jest.fn()} />),
    );
    expect(el.querySelector('a[href="/dashboard/kreator/s1?zakladka=motyw"]')).not.toBeNull();
    expect(el.textContent).toContain('Używa starszej wersji marki – zaktualizuj');
  });
});

describe('zakup i lista marek', () => {
  it('zakup: bez zgody przycisk wyłączony; brak środków – kwota i link do doładowania; opłacony – odświeżenie', async () => {
    akcje.kupMarke.mockResolvedValueOnce({ ok: true, dane: { status: 'brak-srodkow', brakuje: 20 } });
    await act(async () => root.render(<ZakupMarki rodzaj="pakiet" cena={{ brutto: 149, netto: 121.14 }} paynowDostepny />));
    expect(el.textContent).toContain('121,14 zł netto');
    expect(przycisk('BLIK lub przelew')).toBeDefined();
    expect(przycisk('Kupuję')!.disabled).toBe(true);
    await act(async () => (el.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    await act(async () => przycisk('Kupuję')!.click());
    expect(akcje.kupMarke).toHaveBeenCalledWith('pakiet', 'portfel', true);
    expect(el.textContent).toContain('W portfelu brakuje 20 zł');
    expect(el.querySelector('a[href="/dashboard/billing"]')).not.toBeNull();
    akcje.kupMarke.mockResolvedValueOnce({ ok: true, dane: { status: 'oplacony', stan: STAN } });
    await act(async () => przycisk('Kupuję')!.click());
    expect(odswiez).toHaveBeenCalled();
  });

  it('usunięcie marki: potwierdzenie w oknie panelu; anulowanie – bez zapytania', async () => {
    const marki = [{ id: 'm1', nazwa: 'Pracownia Fal', zrodlo: 'nowa' as const, etap: 'projekt' as const, wersja: 2, zaktualizowano: '2026-11-19T10:00:00Z', miniaturaSvg: '<svg/>' }];
    await act(async () => root.render(<ListaMarek marki={marki} />));
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/kreator-marki/marki/m1/logo.svg?uklad=poziomy&wariant=kolor&v=2');
    potwierdz.mockResolvedValueOnce(false);
    await act(async () => (el.querySelector('button[aria-label="Usuń markę Pracownia Fal"]') as HTMLButtonElement).click());
    expect(akcje.usunMarke).not.toHaveBeenCalled();
    potwierdz.mockResolvedValueOnce(true);
    akcje.usunMarke.mockResolvedValueOnce({ ok: true, dane: { ok: true } });
    await act(async () => (el.querySelector('button[aria-label="Usuń markę Pracownia Fal"]') as HTMLButtonElement).click());
    expect(potwierdz).toHaveBeenLastCalledWith(expect.stringContaining('Tego nie da się cofnąć'), expect.objectContaining({ niebezpieczne: true, akcja: 'Usuń markę' }));
    expect(akcje.usunMarke).toHaveBeenCalledWith('m1');
    expect(odswiez).toHaveBeenCalled();
  });
});

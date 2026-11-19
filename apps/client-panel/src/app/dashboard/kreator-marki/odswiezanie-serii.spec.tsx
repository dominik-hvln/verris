/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { koloryMarki, type ProjektLogo, type SeriaMarki, type StanKreatoraMarki, type WidokMarki } from '@verris/kreator/klient';

const akcje = {
  nowaSeria: jest.fn(),
  kierunkiOdswiezenia: jest.fn(),
  stanKreatoraMarki: jest.fn(),
  wybierzKierunek: jest.fn(),
  zapiszProjekt: jest.fn(),
  zmienBrief: jest.fn(),
};
jest.mock('./akcje', () =>
  Object.fromEntries(Object.keys({ nowaSeria: 1, kierunkiOdswiezenia: 1, stanKreatoraMarki: 1, wybierzKierunek: 1, zapiszProjekt: 1, zmienBrief: 1 }).map((k) => [k, (...a: unknown[]) => (akcje as Record<string, jest.Mock>)[k]!(...a)])),
);
const odswiez = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: odswiez }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { EkranMarki } from './ekran-marki';

/**
 * Paczka 134 – feedback z produkcji: „po wygenerowaniu nowej serii nie zmniejsza się liczba dostępnych ani nie
 * przeładowują się one automatycznie”. API oddaje serie od NAJNOWSZEJ, a panel brał ostatni element tablicy (najstarszą
 * serię). Tu: po „Nowa seria” widać nową serię (zaznaczoną), licznik w nagłówku i na przycisku spada bez przeładowania;
 * seria zapasowa ma baner i oznaczenia; 503 – komunikat, nic nie dodane; koncepcja znaku przy propozycji.
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
const stan = (uzyte: number): StanKreatoraMarki => ({
  dostepny: true,
  wersja: 'hosting',
  limity: { marki: { uzyte: 1, limit: 1 }, serie: { uzyte, limit: 3 }, zmianyAi: { uzyte: 0, limit: 50 } },
  pakiet: { kupiony: false, cena: { brutto: 149, netto: 121.14 }, aktualizacjeDo: null },
  drugaMarka: { cena: { brutto: 49, netto: 39.84 }, dostepna: true },
  symboleAi: true,
  maksWgraniaMb: 10,
  marki: [],
});
const S1: SeriaMarki = {
  id: 's1',
  rodzaj: 'nowa',
  utworzono: '2026-11-19T10:00:00.000Z',
  zrodlo: 'ai',
  kierunki: [{ id: 'k1', projekt: projekt(240), dlaczego: 'Spokojna toń.', zrodloZnaku: 'biblioteka', ostrzezenia: [] }],
};
const S2: SeriaMarki = {
  id: 's2',
  rodzaj: 'nowa',
  utworzono: '2026-11-19T11:00:00.000Z',
  zrodlo: 'ai',
  kierunki: [
    { id: 'k1', projekt: projekt(30), koncepcja: 'Litera P złożona z fali – Pracownia, żeglarstwo', dlaczego: 'Ruch wody w literze.', zrodloZnaku: 'ai', ostrzezenia: [] },
    { id: 'k2', projekt: projekt(150), dlaczego: 'Prosty szablon.', zrodloZnaku: 'zamiennik', ostrzezenia: [] },
  ],
};
const widok = (serie: SeriaMarki[]): WidokMarki => ({
  id: 'm1',
  zrodlo: 'nowa',
  etap: 'kierunki',
  wersja: 1,
  brief: BRIEF,
  serie,
  marka: null,
  ocena: null,
  pliki: [],
  strony: [],
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
const wybranaKarta = () => el.querySelector('li button[aria-pressed="true"]')?.textContent ?? '';
const renderuj = () => act(async () => root.render(<EkranMarki widok={widok([S1])} stan={stan(1)} krok="propozycje" strony={null} paynowDostepny={false} />));

it('nowa seria: od razu widoczna i zaznaczona (API – najnowsza pierwsza), liczniki pobrane od nowa, bez podwójnego wywołania', async () => {
  let oddaj!: (w: unknown) => void;
  akcje.nowaSeria.mockReturnValueOnce(new Promise((r) => (oddaj = r)));
  akcje.stanKreatoraMarki.mockResolvedValue({ ok: true, dane: stan(2) });
  await renderuj();
  expect(wybranaKarta()).toContain('Spokojna toń.');
  expect(przycisk('Nowa seria')?.textContent).toContain('zostały 2 z 3 serii');
  expect(el.textContent).toContain('serie 2/3');

  const b = przycisk('Nowa seria')!;
  await act(async () => {
    b.click();
    b.click(); // drugie kliknięcie, zanim React wyłączy przycisk
  });
  expect(akcje.nowaSeria).toHaveBeenCalledTimes(1);
  const wToku = przycisk('Układamy nową serię')!;
  expect(wToku.disabled).toBe(true);
  expect(wToku.getAttribute('aria-busy')).toBe('true');

  await act(async () => oddaj({ ok: true, dane: widok([S2, S1]) }));
  expect(akcje.stanKreatoraMarki).toHaveBeenCalledTimes(1);
  expect(odswiez).toHaveBeenCalled();
  // nowa seria aktywna: nagłówek, zaznaczona pierwsza karta z nowej serii, fokus na nagłówku serii
  expect(el.querySelector('h2')?.textContent).toContain('seria 2');
  expect(wybranaKarta()).toContain('Ruch wody w literze.');
  expect(el.textContent).not.toContain('Spokojna toń.');
  expect(document.activeElement?.textContent).toContain('seria 2');
  // liczniki: przycisk i pigułka w nagłówku
  expect(przycisk('Nowa seria')?.textContent).toContain('została 1 z 3 serii');
  expect(el.textContent).toContain('serie 1/3');
});

it('koncepcja znaku przed „dlaczego” i etykiety źródła (AI, zamiennik)', async () => {
  await act(async () => root.render(<EkranMarki widok={widok([S2, S1])} stan={stan(2)} krok="propozycje" strony={null} paynowDostepny={false} />));
  const karta = wybranaKarta();
  expect(karta).toContain('Znak: Litera P złożona z fali – Pracownia, żeglarstwo');
  expect(karta.indexOf('Znak:')).toBeLessThan(karta.indexOf('Ruch wody w literze.'));
  expect(karta).toContain('Symbol zaprojektowany przez AI dla Twojej firmy – sprawdzony walidatorem');
  expect(el.textContent).toContain('Propozycja zastępcza');
  expect(el.textContent).not.toContain('Propozycje zastępcze – nie z asystenta AI');
});

it('seria zapasowa: baner z komunikatem API nad propozycjami, karty „Propozycja zastępcza”, licznik bez zmian', async () => {
  const zapas: SeriaMarki = { ...S2, zrodlo: 'zapas', komunikat: 'Asystent AI jest chwilowo niedostępny – pokazujemy propozycje z biblioteki. Limit się nie zmienił.' };
  akcje.nowaSeria.mockResolvedValueOnce({ ok: true, dane: widok([zapas, S1]) });
  akcje.stanKreatoraMarki.mockResolvedValue({ ok: true, dane: stan(1) });
  await renderuj();
  await act(async () => przycisk('Nowa seria')!.click());
  expect(el.textContent).toContain('Propozycje zastępcze – nie z asystenta AI');
  expect(el.textContent).toContain(zapas.komunikat);
  const karty = [...el.querySelectorAll('li button[aria-pressed]')];
  expect(karty).toHaveLength(2);
  for (const k of karty) {
    expect(k.textContent).toContain('Propozycja zastępcza');
    expect(k.textContent).not.toContain('zaprojektowany przez AI');
  }
  expect(el.textContent.indexOf('Propozycje zastępcze')).toBeLessThan(el.textContent.indexOf('Ruch wody w literze.'));
  expect(przycisk('Nowa seria')?.textContent).toContain('zostały 2 z 3 serii');
});

it('503 przy nowej serii: komunikat, nic nie dodane, licznik bez zmian', async () => {
  akcje.nowaSeria.mockResolvedValueOnce({ ok: false, status: 503, kod: 'AI_NIEDOSTEPNE', blad: 'Asystent AI jest chwilowo niedostępny. Spróbuj za kilka minut.' });
  akcje.stanKreatoraMarki.mockResolvedValue({ ok: true, dane: stan(1) });
  await renderuj();
  await act(async () => przycisk('Nowa seria')!.click());
  expect(el.textContent).toContain('Nie udało się teraz przygotować nowej serii');
  expect(el.textContent).toContain('Asystent AI jest chwilowo niedostępny. Spróbuj za kilka minut.');
  expect(el.textContent).toContain('Limit serii się nie zmienił.');
  expect(wybranaKarta()).toContain('Spokojna toń.');
  expect(el.querySelector('h2')?.textContent).toContain('seria 1');
  expect(przycisk('Nowa seria')?.textContent).toContain('zostały 2 z 3 serii');
  expect(przycisk('Nowa seria')?.disabled).toBe(false);
});

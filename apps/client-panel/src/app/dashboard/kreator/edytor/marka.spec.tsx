/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { walidujStrone, type Strona } from '@verris/kreator/klient';
import type { MarkaStronyKreatora, PodgladMarkiKreatora, WidokStronyKreatora } from '@/lib/kreator';
import { adresSvg, markaDoPropozycji, opisLiczbyZmian, SCIEZKA_KREATORA_MARKI } from '@/lib/kreator';

/**
 * Paczka 130 – sekcja „Marka” w edytorze strony: „Użyj marki” z podglądem przed/po i wyborem elementów, baner przy
 * nowszej wersji marki, link do Kreatora marki tylko przy włączonym module, odłączenie z potwierdzeniem w oknie panelu.
 */
const markaStrony = jest.fn();
const podgladMarki = jest.fn();
const zastosujMarke = jest.fn();
const odlaczMarke = jest.fn();
jest.mock('../akcje', () => ({
  markaStrony: (...a: unknown[]) => markaStrony(...a),
  podgladMarki: (...a: unknown[]) => podgladMarki(...a),
  zastosujMarke: (...a: unknown[]) => zastosujMarke(...a),
  odlaczMarke: (...a: unknown[]) => odlaczMarke(...a),
}));
const potwierdz = jest.fn();
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), message: jest.fn() } }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { opcjePoczatkowe, SekcjaMarki } from './marka';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ID = '0b8f6a52-5f0e-4b39-9a51-6a1f3c2d4e5f';
const SALON = (() => {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join());
  return w.strona;
})();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#1F3A5F"/></svg>';
const naStronie = { markaId: 'm1', wersja: 2, nazwa: 'Łódka', uzyj: { logo: true, favicon: false } };
const zMarka: Strona = {
  ...SALON,
  marka: { markaId: 'm1', wersja: 2, nazwa: 'Łódka', logoPoziome: SVG, favicon: SVG, kolory: { glowny: '#1F3A5F', akcent: '#E07A3F' }, uzyj: { logo: true, favicon: false } },
};
const wyglad = (logo: string | null) => ({ logo, favicon: null, inicjal: 'P', nazwa: 'Pracownia Fal', paleta: { tlo: '#FFFFFF', tekst: '#111111', akcent: '#1F3A5F', powierzchnia: '#EEEEEE', ciemne: '#111111' }, fonty: { naglowki: 'Fraunces', tekst: 'Inter' } });
const PODGLAD: PodgladMarkiKreatora = {
  stan: 'brak', wersjaNaStronie: null, wersjaMarki: 3,
  zmiany: [{ element: 'logo', opis: 'Logo w nagłówku i stopce' }, { element: 'paleta', opis: 'Paleta z marki' }],
  ostrzezenia: [], przed: wyglad(null), po: wyglad(SVG),
};
const widok = (model: Strona): WidokStronyKreatora => ({
  id: ID, nazwa: 'Salon', status: 'GOTOWA', bladOpis: null, branza: null, model, propozycje: [], zmianyBezPro: [],
  opublikowanaAt: null, domena: null, createdAt: '2026-11-19T10:00:00.000Z', updatedAt: '2026-11-19T10:00:00.000Z',
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

const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst));
const pola = () => [...el.querySelectorAll('input')].filter((i) => i.type === 'checkbox');

async function pokaz(p: { model?: Strona; dostepna?: boolean; stan?: MarkaStronyKreatora; przedZmiana?: () => Promise<boolean>; onZmiana?: jest.Mock }) {
  if (p.stan) markaStrony.mockResolvedValue({ ok: true, dane: p.stan });
  const onZmiana = p.onZmiana ?? jest.fn();
  await act(async () =>
    root.render(<SekcjaMarki id={ID} model={p.model ?? SALON} markaDostepna={p.dostepna ?? true} przedZmiana={p.przedZmiana ?? (async () => true)} onZmiana={onZmiana} />),
  );
  return onZmiana;
}

it('moduł wyłączony, strona bez marki: sekcji nie ma (bez linku do Kreatora marki), bez zapytań do API', async () => {
  await pokaz({ dostepna: false });
  expect(el.innerHTML).toBe('');
  expect(markaStrony).not.toHaveBeenCalled();
});

it('moduł włączony, konto bez marki: link „Stwórz logo w Kreatorze marki”', async () => {
  await pokaz({ stan: { dostepna: true, naStronie: null, marki: [] } });
  const link = el.querySelector<HTMLAnchorElement>(`a[href="${SCIEZKA_KREATORA_MARKI}"]`);
  expect(link?.textContent).toBe('Stwórz logo w Kreatorze marki');
  expect(przycisk('Użyj marki')).toBeUndefined();
});

it('„Użyj marki”: zapis edytora, podgląd z listą zmian i wyglądem przed/po, wybór elementów, zastosowanie', async () => {
  podgladMarki.mockResolvedValue({ ok: true, dane: PODGLAD });
  zastosujMarke.mockResolvedValue({ ok: true, dane: { ...widok(zMarka), zmiany: PODGLAD.zmiany, ostrzezenia: [] } });
  const przedZmiana = jest.fn(async () => true);
  const onZmiana = await pokaz({ stan: { dostepna: true, naStronie: null, marki: [{ markaId: 'm1', nazwa: 'Łódka', wersja: 3, stan: 'brak' }] }, przedZmiana });
  await act(async () => przycisk('Użyj marki')!.click());
  expect(przedZmiana).toHaveBeenCalled();
  expect(podgladMarki).toHaveBeenCalledWith(ID, 'm1', { logo: true, paleta: true, fonty: true, favicon: true });
  expect(el.textContent).toContain('Co się zmieni (2 zmiany)');
  expect(el.textContent).toContain('Logo w nagłówku i stopce');
  expect(el.textContent).toContain('Teraz');
  expect(el.textContent).toContain('Po zmianie');
  // logo jako obrazek (data URI) – nie HTML wstawiany w panel
  expect(el.querySelector('img')?.getAttribute('src')).toBe(adresSvg(SVG));
  expect(el.querySelector('figure svg')).toBeNull();
  expect(el.querySelector('select')).toBeNull();

  // odznaczenie fontów → nowy podgląd z tymi opcjami
  await act(async () => pola()[2]!.click());
  expect(podgladMarki).toHaveBeenLastCalledWith(ID, 'm1', { logo: true, paleta: true, fonty: false, favicon: true });

  await act(async () => przycisk('Zastosuj')!.click());
  expect(zastosujMarke).toHaveBeenCalledWith(ID, 'm1', { logo: true, paleta: true, fonty: false, favicon: true });
  expect(onZmiana).toHaveBeenCalledWith(expect.objectContaining({ id: ID, model: zMarka }), expect.stringContaining('Zastosowano markę: 2 zmiany'));
  expect(przycisk('Zastosuj')).toBeUndefined();
});

it('edytor z błędami (zapis nie przeszedł) – bez podglądu i bez zmian na serwerze', async () => {
  await pokaz({ stan: { dostepna: true, naStronie: null, marki: [{ markaId: 'm1', nazwa: 'Łódka', wersja: 3, stan: 'brak' }] }, przedZmiana: async () => false });
  await act(async () => przycisk('Użyj marki')!.click());
  expect(podgladMarki).not.toHaveBeenCalled();
  expect(zastosujMarke).not.toHaveBeenCalled();
});

it('nowsza wersja marki: baner „Twoja marka się zmieniła – zaktualizuj stronę”, przycisk aktualizacji, domyślnie elementy używane na stronie', async () => {
  podgladMarki.mockResolvedValue({ ok: true, dane: { ...PODGLAD, stan: 'starsza', wersjaNaStronie: 2 } });
  const stan: MarkaStronyKreatora = { dostepna: true, naStronie, marki: [{ markaId: 'm1', nazwa: 'Łódka', wersja: 3, stan: 'starsza' }] };
  await pokaz({ model: zMarka, stan });
  expect(el.textContent).toContain('Twoja marka się zmieniła – zaktualizuj stronę');
  expect(el.textContent).toContain('wersja 2');
  await act(async () => przycisk('Zaktualizuj stronę')!.click());
  // favicon nie był używany – nie zaznaczamy go za klienta
  expect(podgladMarki).toHaveBeenCalledWith(ID, 'm1', { logo: true, paleta: true, fonty: true, favicon: false });
  expect(opcjePoczatkowe(stan)).toEqual({ logo: true, paleta: true, fonty: true, favicon: false });
  // nic nie zmienia się samo – bez zastosowania
  expect(zastosujMarke).not.toHaveBeenCalled();
});

it('odłączenie: potwierdzenie w oknie panelu (nie window.confirm), potem model z serwera', async () => {
  const confirm = jest.spyOn(window, 'confirm');
  potwierdz.mockResolvedValue(true);
  odlaczMarke.mockResolvedValue({ ok: true, dane: { ...widok(SALON), zmiany: [], ostrzezenia: [] } });
  const onZmiana = await pokaz({ model: zMarka, dostepna: false });
  expect(el.textContent).toContain('Strona używa marki „Łódka” (wersja 2)');
  await act(async () => przycisk('Odłącz logo marki')!.click());
  expect(potwierdz).toHaveBeenCalledWith(expect.stringContaining('wróci inicjał firmy'), expect.objectContaining({ akcja: 'Odłącz' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(odlaczMarke).toHaveBeenCalledWith(ID);
  expect(onZmiana).toHaveBeenCalledWith(expect.objectContaining({ model: SALON }), expect.stringContaining('inicjał'));
});

it('pomocnicze: marka do propozycji i odmiana liczby zmian', () => {
  expect(markaDoPropozycji({ dostepna: false, naStronie: null, marki: [{ markaId: 'a', nazwa: 'A', wersja: 1, stan: 'brak' }] })).toBeNull();
  const m: MarkaStronyKreatora = { dostepna: true, naStronie: { ...naStronie, markaId: 'b' }, marki: [{ markaId: 'a', nazwa: 'A', wersja: 1, stan: 'inna' }, { markaId: 'b', nazwa: 'B', wersja: 1, stan: 'aktualna' }] };
  expect(markaDoPropozycji(m)?.markaId).toBe('b');
  expect([1, 2, 5, 12, 22].map(opisLiczbyZmian)).toEqual(['1 zmiana', '2 zmiany', '5 zmian', '12 zmian', '22 zmiany']);
});

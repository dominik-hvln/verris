/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const utworzMarke = jest.fn();
const nowaSeria = jest.fn();
jest.mock('./akcje', () => ({ utworzMarke: (...a: unknown[]) => utworzMarke(...a), nowaSeria: (...a: unknown[]) => nowaSeria(...a) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { ODRZUCONY_BRIEF } from '@/lib/kreator-marki';
import { FormularzBriefu } from './formularz-briefu';
import { wyslijNowaMarke } from './nowa/nowa-marka';
import { PasekBarw } from './wybierak-barwy';

/**
 * Paczka 131 – brief „Nowa marka”: do 3 cech, barwy z wybieraka (klawiatura), walidacja jak zod BriefMarki,
 * błąd API przy nazwie znanej marki z podpowiedzią z projektu prawnego, utworzenie marki + seria → ekran marki.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

const przycisk = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;
const wpisz = (pole: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(pole), 'value')!.set!;
  setter.call(pole, v);
  pole.dispatchEvent(new Event('input', { bubbles: true }));
};

it('cechy: najwyżej 3 – czwarta wyłączona; puste pola – błędy przy polach, bez wysyłki', async () => {
  const onWyslij = jest.fn();
  await act(async () => root.render(<FormularzBriefu przycisk="Pokaż 6 propozycji" onWyslij={onWyslij} />));
  for (const c of ['Spokojna', 'Elegancka', 'Lokalna']) await act(async () => przycisk(c).click());
  expect(przycisk('Ciepła').disabled).toBe(true);
  expect(el.textContent).toContain('Wybrane: 3 z 3');
  await act(async () => przycisk('Pokaż 6 propozycji').click());
  expect(onWyslij).not.toHaveBeenCalled();
  expect(el.textContent).toContain('Wpisz nazwę do logo');
  expect(el.querySelector('input[aria-invalid="true"]')).not.toBeNull();
});

it('błąd API „znana marka” – komunikat, lista błędów i podpowiedź bez nazwy marki', async () => {
  const onWyslij = jest.fn(async () => ({ blad: 'Brief zawiera nazwę znanej marki.', bledy: ['opis: „jak logo X”'], kod: 'ZNANA_MARKA' }));
  await act(async () => root.render(<FormularzBriefu przycisk="Pokaż 6 propozycji" onWyslij={onWyslij} />));
  const [nazwa, , branza] = [...el.querySelectorAll('input')] as HTMLInputElement[];
  await act(async () => {
    wpisz(nazwa!, 'Pracownia Fal');
    wpisz(branza!, 'żeglarstwo');
    wpisz(el.querySelector('textarea')!, 'Kursy jak logo X.');
  });
  await act(async () => przycisk('Pokaż 6 propozycji').click());
  expect(onWyslij).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Pracownia Fal', branza: 'żeglarstwo', podpis: undefined }));
  expect(el.querySelector('[role="alert"]')?.textContent).toContain('Brief zawiera nazwę znanej marki.');
  expect(el.textContent).toContain(ODRZUCONY_BRIEF);
});

it('wysłanie: szkic marki, potem seria, potem ekran propozycji; błąd serii – ekran briefu z informacją', async () => {
  const przejdz = jest.fn();
  utworzMarke.mockResolvedValue({ ok: true, dane: { id: 'm1' } });
  nowaSeria.mockResolvedValueOnce({ ok: true, dane: {} });
  expect(await wyslijNowaMarke({} as never, przejdz)).toBeNull();
  expect(przejdz).toHaveBeenLastCalledWith('/dashboard/kreator-marki/m1?krok=propozycje');
  nowaSeria.mockResolvedValueOnce({ ok: false, blad: 'AI niedostępne', status: 503 });
  await wyslijNowaMarke({} as never, przejdz);
  expect(przejdz).toHaveBeenLastCalledWith('/dashboard/kreator-marki/m1?krok=brief&blad=seria');
  utworzMarke.mockResolvedValueOnce({ ok: false, blad: 'Limit marek', status: 402, kod: 'LIMIT' });
  expect(await wyslijNowaMarke({} as never, przejdz)).toEqual({ blad: 'Limit marek', bledy: undefined, kod: 'LIMIT' });
});

it('wybierak barwy: suwak dostępny z klawiatury (strzałki ±5°, PageUp ±30°, Home/End), wartość słownie', async () => {
  const zmiana = jest.fn();
  await act(async () => root.render(<PasekBarw barwa={200} onZmiana={zmiana} etykieta="Barwa" />));
  const s = el.querySelector('[role="slider"]') as HTMLElement;
  expect(s.getAttribute('aria-valuetext')).toBe('morski, 200°');
  const klawisz = (key: string) => s.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await act(async () => {
    klawisz('ArrowRight');
    klawisz('PageDown');
    klawisz('End');
    klawisz('ArrowLeft');
  });
  expect(zmiana.mock.calls.map((c) => c[0])).toEqual([205, 170, 359, 195]);
  await act(async () => root.render(<PasekBarw barwa={2} onZmiana={zmiana} etykieta="Barwa" />));
  zmiana.mockClear();
  await act(async () => {
    (el.querySelector('[role="slider"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  expect(zmiana).toHaveBeenCalledWith(357);
});

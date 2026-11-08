/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WidokStronyKreatora } from '@/lib/kreator';

/**
 * Paczka 123 – „Spróbuj ponownie” po błędzie generowania: ta sama strona generowana od nowa endpointem API
 * (brief zapisany przy stronie), bez usuwania strony, tworzenia nowej i bez sessionStorage.
 */
const generujPonownie = jest.fn();
const usunStrone = jest.fn();
const utworzStrone = jest.fn();
const pobierzStrone = jest.fn();
jest.mock('../akcje', () => ({
  generujPonownie: (...a: unknown[]) => generujPonownie(...a),
  usunStrone: (...a: unknown[]) => usunStrone(...a),
  utworzStrone: (...a: unknown[]) => utworzStrone(...a),
  pobierzStrone: (...a: unknown[]) => pobierzStrone(...a),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

import { EkranGenerowania } from './generowanie';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ID = '0b8f6a52-5f0e-4b39-9a51-6a1f3c2d4e5f';
const widok = (o: Partial<WidokStronyKreatora> = {}): WidokStronyKreatora => ({
  id: ID, nazwa: 'Salon', status: 'BLAD', bladOpis: 'Nie udało się wygenerować strony.', branza: null, model: null, propozycje: [], zmianyBezPro: [],
  opublikowanaAt: null, domena: null, createdAt: '2026-11-08T10:00:00.000Z', updatedAt: '2026-11-08T10:00:00.000Z', ...o,
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

const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;

it('„Spróbuj ponownie”: generuje tę samą stronę od nowa (bez usuwania i bez sessionStorage) i pokazuje postęp', async () => {
  generujPonownie.mockResolvedValue({ ok: true, dane: widok({ status: 'GENEROWANIE', bladOpis: null, updatedAt: new Date().toISOString() }) });
  const czytaj = jest.spyOn(Storage.prototype, 'getItem');
  await act(async () => root.render(<EkranGenerowania widok={widok()} onGotowa={() => undefined} />));
  expect(el.textContent).toContain('Nie udało się wygenerować strony');
  await act(async () => przycisk('Spróbuj ponownie').click());
  expect(generujPonownie).toHaveBeenCalledWith(ID);
  expect(usunStrone).not.toHaveBeenCalled();
  expect(utworzStrone).not.toHaveBeenCalled();
  expect(czytaj).not.toHaveBeenCalled();
  expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(el.textContent).toContain('Budujemy stronę „Salon”');
});

it('błąd ponownej generacji (np. limit) – komunikat z API, strona zostaje na ekranie błędu', async () => {
  generujPonownie.mockResolvedValue({ ok: false, status: 403, blad: 'Wykorzystano miesięczny limit generacji stron (3).' });
  await act(async () => root.render(<EkranGenerowania widok={widok()} onGotowa={() => undefined} />));
  await act(async () => przycisk('Spróbuj ponownie').click());
  expect(el.textContent).toContain('Wykorzystano miesięczny limit generacji stron (3).');
  expect(el.querySelector('[role="progressbar"]')).toBeNull();
});

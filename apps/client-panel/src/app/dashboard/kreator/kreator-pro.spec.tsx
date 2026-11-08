/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AbonamentKreatoraPro } from '@/lib/kreator';

/**
 * Paczka 123 – karta Kreator Pro: „Odnowienie wyłączone – brak hostingu” i zmiana okresu (miesiąc ↔ rok)
 * od następnego odnowienia z potwierdzeniem.
 */
const zmienOkresPro = jest.fn();
const odswiez = jest.fn();
jest.mock('./akcje', () => ({ zmienOkresPro: (...a: unknown[]) => zmienOkresPro(...a) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: odswiez, push: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('@/app/dashboard/services/subscription-payment-actions', () => ({ cancelSubscriptionAction: jest.fn() }));
jest.mock('@/components/hosting/UnpaidServiceBanner', () => ({ UnpaidServiceBanner: () => null }));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: jest.fn(async () => true) }));

import { potwierdz } from '@/components/panel/potwierdz';
import { AbonamentPro, zmianaOkresuPro } from './kreator-pro';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CENA = { miesiacBrutto: 9.9, miesiacNetto: 8.05, rokBrutto: 99, rokNetto: 80.49 };
const abonament = (o: Partial<AbonamentKreatoraPro> = {}): AbonamentKreatoraPro => ({
  id: 's1', status: 'ACTIVE', interval: 'MONTH', aktywnyDo: '2026-12-08T10:00:00.000Z', odnowienie: 'portfel', bezOdnowienia: false, cena: '9.90', ...o,
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

it('zmiana okresu: miesiąc → rok z kwotą nowego okresu; zaplanowana zmiana – przycisk ją cofa', () => {
  expect(zmianaOkresuPro(abonament(), CENA)).toMatchObject({
    okres: 'YEAR',
    przycisk: 'Zmień na rozliczenie roczne od następnego odnowienia',
    tresc: expect.stringContaining('pobierzemy 99 zł brutto za rok'),
  });
  expect(zmianaOkresuPro(abonament({ interval: 'YEAR' }), CENA)).toMatchObject({ okres: 'MONTH', przycisk: 'Zmień na rozliczenie miesięczne od następnego odnowienia' });
  expect(zmianaOkresuPro(abonament({ nastepnyOkres: 'YEAR' }), CENA)).toMatchObject({ okres: 'MONTH', przycisk: 'Zostań przy rozliczeniu miesięcznym' });
});

it('przycisk na karcie: potwierdzenie, zapis okresu w API, odświeżenie karty', async () => {
  zmienOkresPro.mockResolvedValue({ ok: true, dane: {} });
  await act(async () => root.render(<AbonamentPro abonament={abonament()} cena={CENA} />));
  await act(async () => przycisk('Zmień na rozliczenie roczne')!.click());
  expect(potwierdz).toHaveBeenCalledWith(expect.stringContaining('Bieżący okres zostaje bez zmian'), expect.objectContaining({ tytul: 'Rozliczenie roczne od następnego odnowienia?' }));
  expect(zmienOkresPro).toHaveBeenCalledWith('YEAR');
  expect(odswiez).toHaveBeenCalled();
});

it('odnowienie wyłączone przez brak hostingu: opis na karcie, bez przycisków zmiany okresu i anulowania', async () => {
  await act(async () => root.render(<AbonamentPro abonament={abonament({ bezOdnowienia: true, powodBezOdnowienia: 'brak-hostingu' })} cena={CENA} />));
  expect(el.textContent).toContain('Odnowienie wyłączone – brak hostingu');
  expect(przycisk('Zmień na rozliczenie')).toBeUndefined();
  expect(przycisk('Anuluj odnowienie')).toBeUndefined();
});

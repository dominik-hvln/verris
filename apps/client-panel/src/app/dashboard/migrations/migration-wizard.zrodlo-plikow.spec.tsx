/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 14.10 (uwagi Dominika po e2e PB-45): klient nie musi wiedzieć, czy to SFTP czy FTPS. Protokół „automatycznie”,
 * przy polach „Test połączenia” i „Wybierz katalog z serwera…”, a wykryty plik konfiguracyjny podstawia bazę
 * (u klienta razem z hasłem z jego własnego pliku). Krok „Test dostępów” sam wykrywa protokół, gdy klient go pominął.
 */
const mockTest = jest.fn();
const mockKatalogi = jest.fn();
const mockPreflight = jest.fn();
jest.mock('./actions', () => ({
  preflightMigrationAction: (...a: unknown[]) => mockPreflight(...a),
  createMigrationBundleAction: jest.fn(),
  discoverMigrationSourceAction: jest.fn(),
  testZrodlaPlikowAction: (...a: unknown[]) => mockTest(...a),
  katalogiZrodlaAction: (...a: unknown[]) => mockKatalogi(...a),
}));
jest.mock('../services/[id]/hosting-domains-action', () => ({ fetchHostingDomainsAction: jest.fn().mockResolvedValue({ ok: false }) }));

import { MigrationWizard } from './migration-wizard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = () => {};

let root: Root;
let el: HTMLDivElement;
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const pole = (etykieta: string) =>
  [...el.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(etykieta))!.querySelector('input') as HTMLInputElement;
function wpisz(i: HTMLInputElement, v: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v);
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const wykryto = { ok: true, protocol: 'ftps', port: 21, rsync: false, metoda: 'FTPS (FTP z szyfrowaniem)', nieszyfrowane: false, proby: [] };

async function otworz(zakres: 'pliki' | 'strona' = 'strona') {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<MigrationWizard serviceId="s1" zakres={zakres} />));
  await klik(przycisk('Ręcznie'));
  await klik(przycisk('Dalej: co przenosimy'));
  wpisz(pole('Host'), 'ftp.stary.pl');
  wpisz(pole('Użytkownik'), 'konto');
  wpisz(pole('Hasło'), 'tajne');
}
beforeEach(() => {
  mockTest.mockReset();
  mockKatalogi.mockReset();
  mockPreflight.mockReset().mockResolvedValue({ ok: true, result: { ok: true, checks: [], checkedAt: '' } });
});
afterEach(() => act(() => root.unmount()));

it('domyślnie „Automatycznie”; Test połączenia → wykryty FTPS trafia do zlecenia', async () => {
  mockTest.mockResolvedValue({ ok: true, wynik: wykryto });
  await otworz('pliki');
  expect(el.textContent).toContain('Automatycznie (SFTP → FTPS → FTP)');
  await klik(przycisk('Test połączenia'));
  expect(mockTest).toHaveBeenCalledWith('s1', { host: 'ftp.stary.pl', port: 22, username: 'konto', password: 'tajne' });
  expect(el.textContent).toContain('Połączenie działa — kopiujemy: FTPS (FTP z szyfrowaniem)');
  await klik(przycisk('Dalej'));
  expect(mockPreflight).toHaveBeenCalledWith(expect.objectContaining({ ftp: expect.objectContaining({ protocol: 'ftps', port: 21 }) }));
});

it('bez testu: krok „Test dostępów” sam wykrywa protokół, zanim sprawdzi dostępy', async () => {
  mockTest.mockResolvedValue({ ok: true, wynik: wykryto });
  await otworz('pliki');
  await klik(przycisk('Dalej'));
  expect(mockTest).toHaveBeenCalledTimes(1);
  expect(mockPreflight).toHaveBeenCalledWith(expect.objectContaining({ ftp: expect.objectContaining({ protocol: 'ftps', port: 21 }) }));
});

it('podgląd katalogów: wybór katalogu i baza z wp-config razem z hasłem (klient widzi swój plik)', async () => {
  mockTest.mockResolvedValue({ ok: true, wynik: wykryto });
  mockKatalogi.mockResolvedValue({
    ok: true,
    wynik: {
      sciezka: '/public_html',
      katalogi: ['wp-content'],
      uciete: false,
      strona: true,
      cms: { cms: 'wordpress', nazwa: 'WordPress', plik: 'wp-config.php' },
      baza: { host: 'ftp.stary.pl', port: null, nazwa: 'sklep_wp', uzytkownik: 'sklepu', haslo: 'h@slo', hasloZPliku: true },
    },
  });
  await otworz('strona');
  await klik(przycisk('Wybierz katalog z serwera'));
  expect(mockKatalogi).toHaveBeenCalledWith('s1', expect.objectContaining({ protocol: 'ftps', port: 21, sciezka: '/' }));
  await klik(przycisk('Podstaw dane bazy'));
  const wartosci = [...el.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
  expect(wartosci).toEqual(expect.arrayContaining(['sklep_wp', 'sklepu', 'h@slo']));
  await klik(przycisk('Wybierz ten katalog'));
  expect(pole('Ścieżka na serwerze').value).toBe('/public_html');
});

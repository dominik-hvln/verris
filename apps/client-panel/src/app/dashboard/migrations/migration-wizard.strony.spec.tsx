/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 08.10 (uwaga Dominika): klient z kilkoma stronami na starym hostingu chce przenieść jedną. Kreator pokazywał samą
 * liczbę domen i brał pierwszą z katalogiem „/httpdocs” (Plesk) — teraz lista stron z katalogami i bazami tej strony.
 * Do tego tryb „Wszystko naraz”: pliki, bazy i skrzynki w jednym zleceniu, z zakładaniem brakujących skrzynek.
 */
const mockPreflight = jest.fn();
const mockCreate = jest.fn();
const mockDiscover = jest.fn();
jest.mock('./actions', () => ({
  preflightMigrationAction: (...a: unknown[]) => mockPreflight(...a),
  createMigrationBundleAction: (...a: unknown[]) => mockCreate(...a),
  discoverMigrationSourceAction: (...a: unknown[]) => mockDiscover(...a),
}));

import { MigrationWizard } from './migration-wizard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = () => {};

let root: Root;
let el: HTMLDivElement;

function wpisz(etykieta: string, wartosc: string) {
  const label = [...el.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(etykieta))!;
  const input = label.querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, wartosc);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const pole = (etykieta: string) => [...el.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(etykieta))!.querySelector('input')!;
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));

const wykrycie = {
  panelType: 'plesk',
  panelHost: 'stary.pl',
  panelPort: 8443,
  primaryDomain: 'firma.pl',
  domains: ['firma.pl', 'sklep.pl'],
  databases: [
    { name: 'wp_firma', sizeMb: null, konto: 'firma.pl' },
    { name: 'sklep_db', sizeMb: null, konto: 'sklep.pl' },
  ],
  mailboxes: [{ email: 'biuro@firma.pl', sizeMb: null }],
  sites: [
    { domain: 'firma.pl', kind: 'main', ftpPath: '/httpdocs', konto: 'firma.pl', ftpUser: 'firmaftp' },
    { domain: 'blog.firma.pl', kind: 'sub', ftpPath: '/blog.firma.pl', konto: 'firma.pl' },
    { domain: 'sklep.pl', kind: 'main', ftpPath: '/httpdocs', konto: 'sklep.pl', ftpUser: 'sklepftp' },
  ],
  ftpHint: { host: 'stary.pl', port: 21, username: 'firmaftp', protocol: 'ftp' },
  warnings: [],
};

async function wykryj(zakres: 'strona' | 'wszystko') {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  mockDiscover.mockResolvedValue({ ok: true, result: wykrycie });
  await act(async () => root.render(<MigrationWizard serviceId="s1" zakres={zakres} />));
  await klik(przycisk('Automatycznie'));
  await act(async () => {
    wpisz('Adres panelu', 'stary.pl');
    wpisz('Login do panelu', 'klient');
    wpisz('Hasło do panelu', 'haslo');
  });
  await klik(przycisk('Wykryj zawartość'));
}
afterEach(() => act(() => root.unmount()));

it('lista stron: na start strona główna z jej katalogiem i bazą, po wyborze innej — jej katalog, login FTP i baza', async () => {
  await wykryj('strona');
  expect(el.textContent).toContain('Którą stronę przenosimy?');
  expect(pole('Ścieżka na serwerze').value).toBe('/httpdocs');
  expect(pole('Użytkownik').value).toBe('firmaftp');
  const zaznaczona = (nazwa: string) => (el.querySelector(`[aria-label="Przenieś bazę ${nazwa}"]`) as HTMLInputElement).checked;
  expect(zaznaczona('wp_firma')).toBe(true);
  expect(zaznaczona('sklep_db')).toBe(false);

  await klik(el.querySelector('[role="combobox"]')!);
  await klik([...el.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('sklep.pl'))!);
  expect(pole('Ścieżka na serwerze').value).toBe('/httpdocs');
  expect(pole('Użytkownik').value).toBe('sklepftp');
  expect(pole('Domena na starym hostingu').value).toBe('sklep.pl');
  expect(zaznaczona('wp_firma')).toBe(false);
  expect(zaznaczona('sklep_db')).toBe(true);

  await klik(el.querySelector('[role="combobox"]')!);
  await klik([...el.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('blog.firma.pl'))!);
  expect(pole('Ścieżka na serwerze').value).toBe('/blog.firma.pl');

  mockPreflight.mockResolvedValue({ ok: true, result: { ok: true, checks: [], checkedAt: 'x' } });
  await klik(przycisk('Dalej: test dostępów'));
  const wyslane = mockPreflight.mock.calls[0][0];
  expect(wyslane.ftp.remotePath).toBe('/blog.firma.pl');
  expect(wyslane.mysql.map((m: { database: string }) => m.database)).toEqual(['wp_firma']);
  expect(wyslane.imap).toEqual([]);
});

it('„Wszystko naraz”: skrzynki z wykrycia, hasło wpisuje klient, start z zakładaniem brakujących skrzynek', async () => {
  await wykryj('wszystko');
  expect(el.textContent).toContain('Skrzynki pocztowe (1)');
  expect((el.querySelector('[aria-label="Adres skrzynki"]') as HTMLInputElement).value).toBe('biuro@firma.pl');
  await act(async () => {
    const haslo = el.querySelector('[aria-label="Hasło skrzynki"]') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(haslo, 'poczta1');
    haslo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  mockPreflight.mockResolvedValue({ ok: true, result: { ok: true, checks: [], checkedAt: 'x' } });
  await klik(przycisk('Dalej: test dostępów'));
  expect(mockPreflight.mock.calls.at(-1)[0].imap).toEqual([
    { host: 'stary.pl', port: 993, username: 'biuro@firma.pl', password: 'poczta1', email: 'biuro@firma.pl' },
  ]);
  await klik(przycisk('Dalej: podsumowanie'));
  expect(el.textContent).toContain('Skrzynki: 1 (brakujące założymy)');
  // zgoda RODO — jedyne pole zaznaczenia na ostatnim kroku
  await klik([...el.querySelectorAll('input')].find((i) => i.type === 'check' + 'box')!);
  mockCreate.mockResolvedValue({ ok: true, migration: {} });
  await klik(przycisk('Uruchom migrację'));
  expect(mockCreate.mock.calls[0][0]).toMatchObject({ utworzBrakujaceSkrzynki: true, consentAccepted: true });
});

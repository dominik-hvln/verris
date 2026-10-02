/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * E-21 — uwaga z t1 (02.10): nie dało się przenieść poczty do skrzynki o innym adresie niż stara.
 * Formularz poczty: dane źródła + test, wybór skrzynki docelowej + test, dopiero potem start —
 * a do API idzie skrzynka wybrana z listy (email), niezależnie od loginu u starego dostawcy.
 */
const mockPreflight = jest.fn();
const mockCreate = jest.fn();
jest.mock('./actions', () => ({
  preflightMigrationAction: (...a: unknown[]) => mockPreflight(...a),
  createMigrationBundleAction: (...a: unknown[]) => mockCreate(...a),
}));
jest.mock('@/app/dashboard/services/[id]/hosting-email-actions', () => ({
  fetchHostingEmailAction: async () => ({
    ok: true,
    dane: { rows: [{ email: 'import@nowa.pl', quotaMb: 500 }, { email: 'biuro@nowa.pl', quotaMb: null }], fetchError: null },
  }),
}));

import { MigracjaPoczty } from './migracja-poczty';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = () => {}; // jsdom nie ma — Select przewija listę opcji

let root: Root;
let el: HTMLDivElement;
const flush = () => act(async () => {});

function wpisz(etykieta: string, wartosc: string) {
  const label = [...el.querySelectorAll('label')].find((l) => l.textContent?.includes(etykieta))!;
  const input = label.querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, wartosc);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
const zgoda = () => [...el.querySelectorAll('input')].find((i) => i.type === 'checkbox')!;
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));

beforeEach(async () => {
  mockPreflight.mockResolvedValue({ result: { ok: true, checks: [{ kind: 'imap', target: 'x', status: 'ok', message: 'Logowanie OK' }] } });
  mockCreate.mockResolvedValue({ migration: {} });
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<MigracjaPoczty serviceId="s1" />));
  await flush();
});
afterEach(() => act(() => root.unmount()));

it('start dopiero po obu testach i zgodzie; do API idzie wybrana skrzynka, nie login źródła', async () => {
  await act(async () => {
    wpisz('Serwer IMAP', 'imap.stary.pl');
    wpisz('Login', 'stary@stara.pl');
    wpisz('Hasło', 'tajne');
  });
  expect(przycisk('Przenieś pocztę').disabled).toBe(true);

  await klik(przycisk('Sprawdź dane'));
  expect(mockPreflight).toHaveBeenCalledWith({
    serviceId: 's1',
    imap: [expect.objectContaining({ host: 'imap.stary.pl', username: 'stary@stara.pl' })],
  });
  expect(el.textContent).toContain('Logowanie OK');

  await klik(el.querySelector('[role="combobox"]')!);
  await klik([...el.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('import@nowa.pl'))!);
  // Zmiana celu unieważnia test źródła (inny e-mail w danych testu) — trzeba sprawdzić ponownie.
  await klik(przycisk('Sprawdź dane'));
  await klik(przycisk('Sprawdź skrzynkę'));
  expect(el.textContent).toContain('Skrzynka import@nowa.pl jest na tym koncie');
  expect(przycisk('Przenieś pocztę').disabled).toBe(true);

  await klik(zgoda());
  expect(przycisk('Przenieś pocztę').disabled).toBe(false);
  await klik(przycisk('Przenieś pocztę'));
  expect(mockCreate).toHaveBeenCalledWith({
    serviceId: 's1',
    consentAccepted: true,
    imap: [{ host: 'imap.stary.pl', port: 993, username: 'stary@stara.pl', password: 'tajne', email: 'import@nowa.pl' }],
  });
});

it('nieudany test źródła blokuje start', async () => {
  mockPreflight.mockResolvedValue({ result: { ok: false, checks: [{ kind: 'imap', target: 'x', status: 'auth_failed', message: 'Złe hasło' }] } });
  await act(async () => {
    wpisz('Serwer IMAP', 'imap.stary.pl');
    wpisz('Login', 'stary@stara.pl');
    wpisz('Hasło', 'zle');
  });
  await klik(el.querySelector('[role="combobox"]')!);
  await klik([...el.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('biuro@nowa.pl'))!);
  await klik(przycisk('Sprawdź dane'));
  await klik(przycisk('Sprawdź skrzynkę'));
  await klik(zgoda());
  expect(el.textContent).toContain('Złe hasło');
  expect(przycisk('Przenieś pocztę').disabled).toBe(true);
});

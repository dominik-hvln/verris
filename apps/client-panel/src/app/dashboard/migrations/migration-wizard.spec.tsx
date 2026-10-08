/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Z-09 — uwaga z t1 (08.10): host odrzucony jako prywatny/serwer Verris dawał w teście dostępów
 * „Część źródeł wymaga uwagi — możesz kontynuować, resztę dokończymy po naszej stronie” i przepuszczał
 * dalej, choć takiej migracji nikt nie dokończy. Do tego komunikat błędu startu zostawał na ekranie
 * po cofnięciu i zmianie hosta.
 */
const mockPreflight = jest.fn();
const mockCreate = jest.fn();
jest.mock('./actions', () => ({
  preflightMigrationAction: (...a: unknown[]) => mockPreflight(...a),
  createMigrationBundleAction: (...a: unknown[]) => mockCreate(...a),
  discoverMigrationSourceAction: jest.fn(),
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
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));

beforeEach(async () => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<MigrationWizard serviceId="s1" zakres="pliki" />));
  await klik(przycisk('Ręcznie'));
  await klik(przycisk('Dalej: co przenosimy'));
  await act(async () => {
    wpisz('Domena docelowa', 'd3.example.pl');
    wpisz('Host', '127.0.0.1');
    wpisz('Użytkownik', 'test');
  });
});
afterEach(() => act(() => root.unmount()));

it('host odrzucony przez API (status blocked) zatrzymuje kreator na teście dostępów', async () => {
  mockPreflight.mockResolvedValue({
    result: {
      ok: false,
      checks: [{ kind: 'ftp', target: 'ftp://127.0.0.1:21', status: 'blocked', message: 'Host wskazuje na sieć prywatną — odrzucono.', latencyMs: 1 }],
      checkedAt: '2026-10-08T10:00:00Z',
    },
  });
  await klik(przycisk('Dalej: test dostępów'));
  expect(el.textContent).not.toContain('resztę dokończymy po naszej stronie');
  expect(el.textContent).toContain('podaj adres serwera starego hostingu');
  expect(przycisk('Dalej: podsumowanie').disabled).toBe(true);
});

it('host nieosiągalny (unreachable) nadal pozwala przejść dalej', async () => {
  mockPreflight.mockResolvedValue({
    result: { ok: false, checks: [{ kind: 'ftp', target: 'ftp://x:21', status: 'unreachable', message: 'Brak połączenia: timeout', latencyMs: 1 }], checkedAt: 'x' },
  });
  await klik(przycisk('Dalej: test dostępów'));
  expect(przycisk('Dalej: podsumowanie').disabled).toBe(false);
});

it('błąd startu znika po cofnięciu do formularza', async () => {
  mockPreflight.mockResolvedValue({
    result: { ok: false, checks: [{ kind: 'ftp', target: 'ftp://x:21', status: 'unreachable', message: 'Brak połączenia: timeout', latencyMs: 1 }], checkedAt: 'x' },
  });
  mockCreate.mockResolvedValue({ error: 'Host wskazuje na sieć prywatną — odrzucono.' });
  await klik(przycisk('Dalej: test dostępów'));
  await klik(przycisk('Dalej: podsumowanie'));
  await klik([...el.querySelectorAll('input')].find((i) => i.type === 'checkbox')!);
  await klik(przycisk('Uruchom migrację'));
  expect(el.textContent).toContain('Host wskazuje na sieć prywatną');
  await klik(przycisk('Wstecz'));
  await klik(przycisk('Wstecz'));
  expect(el.textContent).not.toContain('Host wskazuje na sieć prywatną');
});

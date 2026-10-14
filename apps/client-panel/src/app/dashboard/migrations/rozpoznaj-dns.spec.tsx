/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** 14.10 — krok „Skąd”: adres starej strony → podpowiedź adresu panelu z DNS (bez łączenia z cudzym hostem). */
const mockRozpoznaj = jest.fn();
jest.mock('./actions', () => ({
  rozpoznajZrodloAction: (...a: unknown[]) => mockRozpoznaj(...a),
  preflightMigrationAction: jest.fn(),
  createMigrationBundleAction: jest.fn(),
  discoverMigrationSourceAction: jest.fn(),
}));

import { RozpoznajZDns } from './migration-wizard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let el: HTMLDivElement;
afterEach(() => act(() => root.unmount()));

async function montuj(onHost: (h: string) => void) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<RozpoznajZDns serviceId="s1" onHost={onHost} />));
  const input = el.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Firma.pl');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Sprawdź w DNS'))!.click();
  });
}

it('podpowiedź z DNS wpisuje adres panelu i pokazuje, gdzie stoi strona i poczta', async () => {
  mockRozpoznaj.mockResolvedValue({ ok: true, result: { domena: 'firma.pl', a: ['198.51.100.10'], mx: ['mx1.stary.pl'], ns: [], podpowiedzHosta: 'serwer123.stary.pl' } });
  const onHost = jest.fn();
  await montuj(onHost);
  expect(mockRozpoznaj).toHaveBeenCalledWith('s1', 'firma.pl');
  expect(onHost).toHaveBeenCalledWith('serwer123.stary.pl');
  expect(el.querySelector('[data-wynik-dns]')!.textContent).toContain('Wpisaliśmy adres panelu: serwer123.stary.pl');
});

it('bez podpowiedzi — adresu panelu nie zmieniamy i mówimy, gdzie go szukać', async () => {
  mockRozpoznaj.mockResolvedValue({ ok: true, result: { domena: 'firma.pl', a: [], mx: [], ns: [], podpowiedzHosta: null } });
  const onHost = jest.fn();
  await montuj(onHost);
  expect(onHost).not.toHaveBeenCalled();
  expect(el.querySelector('[data-wynik-dns]')!.textContent).toContain('mailu powitalnym');
});

/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * P5-14 (paczka 109) — nowy token API domyślnie wygasa po 90 dniach; „Bez wygaśnięcia” to świadomy wybór.
 * Na starym kodzie formularz wysyłał `expiresInDays: null` (token wieczny), gdy nikt nie ruszył listy.
 */
const mockUtworz = jest.fn();
jest.mock('./actions', () => ({
  fetchTokens: async () => [],
  fetchScopes: async () => [{ value: 'dns:read', label: 'Odczyt DNS' }],
  createTokenAction: (...a: unknown[]) => mockUtworz(...a),
  revokeTokenAction: jest.fn(),
}));

import { ApiTokensClient } from './api-tokens-client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('bez zmiany listy token powstaje z terminem 90 dni', async () => {
  mockUtworz.mockReset().mockResolvedValue({ ok: true, token: 'vrs_live_x' });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<ApiTokensClient />));
  const nazwa = el.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(nazwa, 'CI deploy');
    nazwa.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => el.querySelector<HTMLInputElement>('[role="group"] input')!.click());
  const przycisk = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Utwórz token'))!;
  await act(async () => przycisk.click());
  expect(mockUtworz).toHaveBeenCalledWith(expect.objectContaining({ name: 'CI deploy', expiresInDays: 90 }));
  act(() => root.unmount());
  document.body.innerHTML = '';
});

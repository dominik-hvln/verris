/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 19.10 — powrót z płatności kartą (Stripe Checkout → `?platnosc=karta`): baner czeka na aktywację usługi
 * i po niej woła odświeżenie strony; po limicie prób przestaje pytać.
 */
const mockStan = jest.fn();
jest.mock('@/app/dashboard/services/subscription-payment-actions', () => ({
  stanUslugiPoPlatnosciAction: (...a: unknown[]) => mockStan(...a),
}));

import { LIMIT_PROB, ODSTEP_SPRAWDZANIA_MS, PlatnoscKartaBaner, etapPlatnosci } from './platnosc-karta';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('etapPlatnosci', () => {
  it('ACTIVE = gotowe, wcześniej czekamy, po limicie prób — długo', () => {
    expect(etapPlatnosci('ACTIVE', 1)).toBe('gotowe');
    expect(etapPlatnosci('PENDING_PAYMENT', 1)).toBe('czekamy');
    expect(etapPlatnosci('PROVISIONING', LIMIT_PROB - 1)).toBe('czekamy');
    expect(etapPlatnosci(null, LIMIT_PROB)).toBe('dlugo');
  });
});

describe('PlatnoscKartaBaner', () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    jest.useFakeTimers();
    mockStan.mockReset();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    jest.useRealTimers();
  });

  it('czeka, aż usługa będzie aktywna, i wtedy woła onGotowe', async () => {
    mockStan
      .mockResolvedValueOnce({ ok: true, data: { status: 'PENDING_PAYMENT' } })
      .mockResolvedValueOnce({ ok: true, data: { status: 'ACTIVE' } });
    const onGotowe = jest.fn();
    await act(async () => {
      root.render(<PlatnoscKartaBaner serviceId="s1" onGotowe={onGotowe} />);
    });
    expect(el.textContent).toContain('uruchamiamy usługę');
    expect(onGotowe).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(ODSTEP_SPRAWDZANIA_MS);
    });
    expect(mockStan).toHaveBeenCalledTimes(2);
    expect(onGotowe).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('usługa działa');
  });
});

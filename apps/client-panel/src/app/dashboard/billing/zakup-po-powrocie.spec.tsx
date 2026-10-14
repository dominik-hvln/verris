/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockTrack = jest.fn();
jest.mock('@/lib/analytics-events', () => ({ trackPurchase: (...a: unknown[]) => mockTrack(...a) }));

import { ZakupPoPowrocie } from './zakup-po-powrocie';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const zakup = { transactionId: 'sub-1', wartosc: 381.65, waluta: 'PLN', nazwa: 'Hosting Verris z autoskalowaniem', kategoria: 'hosting' as const };

async function renderuj(z: typeof zakup | null) {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<ZakupPoPowrocie zakup={z} />));
  act(() => root.unmount());
}

describe('PB-08 — purchase po powrocie z Paynow', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    sessionStorage.clear();
  });

  it('opłacone zamówienie → purchase z id usługi i kwotą wpłaty; ponowne wejście w tej karcie nie dubluje', async () => {
    await renderuj(zakup);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith({
      transactionId: 'sub-1',
      value: 381.65,
      items: [{ item_name: 'Hosting Verris z autoskalowaniem', item_category: 'hosting', price: 381.65, quantity: 1 }],
    });
    await renderuj(zakup);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('bez zakupu (doładowanie, odnowienie, płatność w toku) → nic', async () => {
    await renderuj(null);
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

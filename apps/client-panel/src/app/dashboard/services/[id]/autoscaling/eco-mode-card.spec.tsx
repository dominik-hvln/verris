/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../eco-mode-actions', () => ({ patchSubscriptionEcoMode: jest.fn() }));

import { EcoModeCard } from './eco-mode-card';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Przegląd 13.10 (prod): karta usługi pokazywała „Twoje punkty EKO: —”, choć pulpit miał 136 pkt. */
describe('EcoModeCard — saldo punktów z rodzica', () => {
  it('saldo przychodzące po pierwszym renderze (null → 136) jest pokazane', async () => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={null} />));
    expect(el.textContent).toContain('Twoje punkty EKO: —');
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={136} />));
    expect(el.textContent).toContain('Twoje punkty EKO: 136');
    act(() => root.unmount());
  });
});

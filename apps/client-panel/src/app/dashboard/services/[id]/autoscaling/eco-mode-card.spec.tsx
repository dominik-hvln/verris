/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockPatch = jest.fn();
jest.mock('../eco-mode-actions', () => ({ patchSubscriptionEcoMode: (...a: unknown[]) => mockPatch(...a) }));

import { EcoModeCard } from './eco-mode-card';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Przegląd 13.10 (prod): karta usługi pokazywała „Twoje punkty EKO: —”, choć pulpit miał 136 pkt. */
describe('EcoModeCard – saldo punktów z rodzica', () => {
  it('saldo przychodzące po pierwszym renderze (null → 136) jest pokazane', async () => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={null} />));
    expect(el.textContent).toContain('Twoje punkty EKO: –');
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={136} />));
    expect(el.textContent).toContain('Twoje punkty EKO: 136');
    act(() => root.unmount());
  });

  it('premia za pierwsze włączenie: doliczona od razu, ale nie drugi raz, gdy rodzic poda saldo już z premią', async () => {
    mockPatch.mockResolvedValue({ ecoPointsAwarded: true });
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={136} />));
    const przelacznik = el.querySelector('[role="checkbox"], button[aria-checked], input') as HTMLElement;
    await act(async () => przelacznik.click());
    expect(el.textContent).toMatch(/Twoje punkty EKO: 141/);
    await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={141} />));
    expect(el.textContent).toMatch(/Twoje punkty EKO: 141/);
    act(() => root.unmount());
  });
});

// Decyzja 7 (3.11): po włączeniu Trybu EKO jasne ostrzeżenie o rzadszych kopiach; bez twierdzeń środowiskowych.
it('Tryb EKO włączony: ostrzeżenie o kopiach raz w tygodniu; wyłączony: bez ostrzeżenia', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<EcoModeCard subscriptionId="s1" ecoModeEnabled={false} ecoPoints={0} />));
  expect(el.querySelector('[role="status"]')).toBeNull();
  expect(el.textContent).not.toMatch(/środowisk/);
  act(() => root.unmount());
  const el2 = document.createElement('div');
  const root2 = createRoot(el2);
  await act(async () => root2.render(<EcoModeCard subscriptionId="s2" ecoModeEnabled ecoPoints={0} />));
  expect(el2.querySelector('[role="status"]')?.textContent).toContain('nawet tydzień');
  expect(el2.textContent).toContain('raz w tygodniu zamiast codziennie');
  act(() => root2.unmount());
});

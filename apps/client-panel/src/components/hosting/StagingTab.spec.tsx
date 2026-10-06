/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** Próba bety 06.10: „Odśwież z produkcji” nadpisywało istniejący staging jednym kliknięciem, bez pytania. */
const mockRefresh = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock('@/app/dashboard/services/[id]/staging-env-actions', () => ({
  getStagingEnv: async () => ({ exists: true, stagingDomain: 'staging.a.pl', stagingUrl: 'https://staging.a.pl', syncedAt: '2026-10-06T12:00:00Z', lastTask: null }),
  createOrRefreshStaging: (...a: unknown[]) => mockRefresh(...a),
  deleteStagingEnv: jest.fn(),
  pushStagingToLive: jest.fn(),
}));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));

import StagingTab from './StagingTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function kliknijOdswiez(zgoda: boolean) {
  mockPotwierdz.mockResolvedValue(zgoda);
  mockRefresh.mockResolvedValue({ exists: true });
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<StagingTab serviceId="s1" />));
  const btn = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Odśwież z produkcji'))!;
  await act(async () => btn.click());
  act(() => root.unmount());
}

it('bez zgody nie nadpisuje stagingu', async () => {
  mockRefresh.mockClear();
  await kliknijOdswiez(false);
  expect(mockPotwierdz).toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('po zgodzie odświeża z produkcji', async () => {
  mockRefresh.mockClear();
  await kliknijOdswiez(true);
  expect(mockRefresh).toHaveBeenCalledWith('s1');
});

/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * C-27 — t1 04.10: po pushu webhook pobrał zmiany, a lista w panelu dalej pokazywała „jeszcze nie wywołany”
 * aż do przeładowania strony — „Odśwież” zakładki nie wczytywał sekcji repozytorium.
 */
const mockFetchGit = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-git-actions', () => ({
  fetchGit: (...a: unknown[]) => mockFetchGit(...a),
  createGitWebhook: jest.fn(),
  deleteGitWebhook: jest.fn(),
  gitOp: jest.fn(),
}));

import { GitRepoPanel } from './GitRepoPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('zmiana odswiezNr wczytuje stan repozytorium ponownie', async () => {
  mockFetchGit.mockResolvedValue({ ok: true, status: { domena: 'a.pl', wToku: false, klucz: null, webhooki: [], operacje: [] } });
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} odswiezNr={0} />));
  expect(mockFetchGit).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} odswiezNr={1} />));
  expect(mockFetchGit).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

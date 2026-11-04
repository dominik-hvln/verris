/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('./konta-actions', () => ({ pobierzKontaAction: jest.fn(async () => []), przelaczKontoAction: jest.fn() }));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));

import { PasekCudzegoKonta } from './przelacznik-kont';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** P3-08 — subkonto nie wiedziało, czyje konto obsługuje (pulpit mówił „Twoje usługi”). */
it('subkonto: pasek „Pracujesz na koncie …” bez przycisku powrotu; konto własne: nic', () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => root.render(<PasekCudzegoKonta actingFor={null} zakres={0} kontoSubkonta={{ ownerUserId: 'o1', nazwa: 'Kasia Studio', email: 'kasia@firma.pl' }} />));
  expect(el.textContent).toContain('Pracujesz na koncie Kasia Studio (kasia@firma.pl)');
  expect(el.querySelector('button')).toBeNull();
  act(() => root.render(<PasekCudzegoKonta actingFor={null} zakres={0} />));
  expect(el.textContent).toBe('');
  act(() => root.unmount());
});

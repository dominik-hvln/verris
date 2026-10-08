/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('./actions', () => ({}));
import { JobRow } from './migration-progress';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** t1, 08.10 (#da592220): migracja samych plików WordPressa — test strony bez bazy wraca błędem, to nie awaria. */
it('krok testu strony z uwagą „strona-bez-bazy” mówi, co zrobić z bazą', async () => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () =>
    root.render(
      <ul>
        <JobRow
          job={{
            id: 'j', kind: 'HTTP_POST_CHECK', status: 'COMPLETED', sequence: 90, attempts: 1, maxAttempts: 1, lastError: 'http check failed',
            progress: null, integrity: null, uwaga: 'strona-bez-bazy', lastHeartbeatAt: null, startedAt: null, completedAt: null,
          } as never}
        />
      </ul>,
    ),
  );
  expect(el.textContent).toContain('Baza danych');
  expect(el.textContent).not.toContain('http check failed');
  act(() => root.unmount());
});

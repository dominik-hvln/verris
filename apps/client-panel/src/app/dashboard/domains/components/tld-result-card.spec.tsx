/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../actions', () => ({}));

import { TldResultCard } from './domain-purchase-wizard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** A-11, t1 04.10: TLD bez odpowiedzi rejestru pokazywał się jako „Zajęta” — klient myślał, że domena jest zajęta. */
it.each([
  [{ label: '.online', available: false, unknown: true }, 'Nie sprawdzono — spróbuj później'],
  [{ label: '.pl', available: false }, 'Zajęta'],
])('%o → %s', async (result, tekst) => {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () =>
    root.render(<TldResultCard result={result as never} label="firma" selected={false} onSelect={() => {}} disabled={false} />),
  );
  expect(el.textContent).toContain(tekst);
  act(() => root.unmount());
});

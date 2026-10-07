/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** 07.10 — cudza albo nieistniejąca usługa: bez menu usługi w bocznym pasku, tylko komunikat strony. */
const mockKind = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-service-actions', () => ({ fetchServiceKindAction: (...a: unknown[]) => mockKind(...a) }));
jest.mock('@/app/dashboard/services/[id]/hosting-domains-action', () => ({
  fetchHostingDomainsAction: async () => ({ ok: true, data: { domains: [], primaryDomain: null } }),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('kind=HOSTING'),
  usePathname: () => '/dashboard/services/x',
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import { ServiceNav } from './service-nav';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function render() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(async () => {
    createRoot(el).render(<ServiceNav serviceId="x" />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return el;
}

describe('ServiceNav', () => {
  it('API odmawia (usługa nie istnieje / nie jest klienta) → brak menu usługi', async () => {
    mockKind.mockRejectedValueOnce(new Error('Nie znaleziono usługi.'));
    expect((await render()).textContent).toBe('');
  });

  it('własna usługa → menu z „Przegląd”', async () => {
    mockKind.mockResolvedValueOnce({ productKind: 'HOSTING', serviceTag: 'abc' });
    expect((await render()).textContent).toContain('Przegląd');
  });
});

/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Przegląd 13.10 — „Zapłać BLIK-iem lub przelewem” tylko tam, gdzie wpłata sama przywraca usługę: zamówienie
 * czekające na płatność, zaległe odnowienie, zawieszenie po karencji. Zawieszenie „brak płatności” wybrane przez
 * obsługę zdejmuje obsługa — tam API odmawia, więc przycisku nie ma (wcześniej klient płacił, a usługa nie wracała).
 */
const mockZaplac = jest.fn();
jest.mock('@/app/dashboard/services/subscription-payment-actions', () => ({
  abandonUnpaidSubscriptionAction: jest.fn(),
  payPastDueFromWalletAction: jest.fn(),
  retrySubscriptionPaymentAction: jest.fn(),
  zaplacPaynowAction: (...a: unknown[]) => mockZaplac(...a),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import { UnpaidServiceBanner } from './UnpaidServiceBanner';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  mockZaplac.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

const zawieszenie = (reason: string) => [{ type: 'SUSPENDED', createdAt: '2026-10-10T08:00:00Z', details: { reason } }];
async function pokaz(p: Parameters<typeof UnpaidServiceBanner>[0]) {
  await act(async () => root.render(<UnpaidServiceBanner {...p} />));
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('BLIK-iem lub przelewem'));
}

it('zamówienie z portfela czekające na płatność, zaległość i zawieszenie po karencji: przycisk Paynow', async () => {
  expect((await pokaz({ serviceId: 's1', status: 'PENDING_PAYMENT', paymentSource: 'WALLET' }))?.textContent).toBe('Zapłać BLIK-iem lub przelewem');
  expect((await pokaz({ serviceId: 's1', status: 'PAST_DUE', paymentSource: 'WALLET' }))?.textContent).toBe('Zapłać za odnowienie BLIK-iem lub przelewem');
  expect(await pokaz({ serviceId: 's1', status: 'SUSPENDED', paymentSource: 'WALLET', events: zawieszenie('GRACE_EXPIRED') })).toBeDefined();
});

it('zawieszenie „brak płatności” przez obsługę i usługa na karcie: bez przycisku Paynow', async () => {
  const t = await pokaz({ serviceId: 's1', status: 'SUSPENDED', paymentSource: 'WALLET', events: zawieszenie('PAYMENT_FAILED') });
  expect(t).toBeUndefined();
  expect(el.textContent).not.toContain('BLIK');
  expect(await pokaz({ serviceId: 's1', status: 'PAST_DUE', paymentSource: 'STRIPE_CARD' })).toBeUndefined();
});

it('klik: adres płatności z API, błąd API widoczny dla klienta', async () => {
  mockZaplac.mockResolvedValueOnce({ ok: false, error: 'Poprzednia płatność za to zamówienie jeszcze trwa' });
  const b = await pokaz({ serviceId: 's9', status: 'PENDING_PAYMENT', paymentSource: 'WALLET' });
  await act(async () => void b!.click());
  expect(mockZaplac).toHaveBeenCalledWith('s9');
  expect(el.textContent).toContain('Poprzednia płatność za to zamówienie jeszcze trwa');
});

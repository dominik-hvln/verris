/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ServiceDetailsDto } from '@verris/contracts';

/**
 * Weryfikacja 11.10 — po anulacji na koniec okresu (cancelAt) zakładka „Subskrypcja i płatności” pokazywała
 * „Działa do 8 listopada 2026”, a obok dalej przycisk „Zrezygnuj z usługi”. Klient nie ma w API cofnięcia własnej
 * rezygnacji — zamiast przycisku informacja z datą i drogą do obsługi.
 */
const mockDetails = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-service-actions', () => ({
  fetchServiceDetailsAction: (...a: unknown[]) => mockDetails(...a),
}));
jest.mock('@/app/dashboard/services/subscription-payment-actions', () => ({
  cancelSubscriptionAction: jest.fn(),
  abandonUnpaidSubscriptionAction: jest.fn(),
  payPastDueFromWalletAction: jest.fn(),
  retrySubscriptionPaymentAction: jest.fn(),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import ServiceSubscriptionTab from './ServiceSubscriptionTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const usluga = (extra: Partial<ServiceDetailsDto> = {}): ServiceDetailsDto =>
  ({
    id: 's1',
    status: 'ACTIVE',
    paymentSource: 'WALLET',
    plan: { id: 'p1', slug: 'hosting', name: 'Hosting', description: null, cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240 },
    interval: 'MONTH',
    priceAmount: '45.00',
    renewalAmount: '45.00',
    currency: 'PLN',
    currentPeriodStart: '2026-10-08T10:00:00Z',
    currentPeriodEnd: '2026-11-08T10:00:00Z',
    cancelAt: null,
    ecoModeEnabled: false,
    autoscalingEnabled: false,
    autoscalingMaxCost: '0',
    isTrial: false,
    trialEndsAt: null,
    productKind: 'HOSTING',
    account: null,
    provisioning: null,
    health: { score: null, label: 'pending', summary: null, checks: null, computedAt: null },
    recommendations: [],
    events: [],
    ...extra,
  }) as unknown as ServiceDetailsDto;

let root: Root;
let el: HTMLElement;
async function zamontuj(s: ServiceDetailsDto) {
  mockDetails.mockResolvedValue({ ok: true, dane: s });
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<ServiceSubscriptionTab serviceId="s1" />));
}
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('ServiceSubscriptionTab — rezygnacja na koniec okresu', () => {
  it('z cancelAt: „Działa do”, informacja o rezygnacji, bez przycisku „Zrezygnuj z usługi”', async () => {
    await zamontuj(usluga({ cancelAt: '2026-11-08T10:00:00Z', events: [{ id: 'e1', type: 'CANCEL_SCHEDULED', createdAt: '2026-10-11T10:00:00Z' }] as never }));
    expect(el.textContent).toContain('Działa do');
    expect(el.textContent).toContain('Rezygnacja zaplanowana');
    expect(el.textContent).toContain('Usługa działa do 8 listopada 2026 i nie odnowi się');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Zrezygnuj z usługi');
  });

  it('bez rezygnacji: „Następne odnowienie” i przycisk „Zrezygnuj z usługi”', async () => {
    await zamontuj(usluga());
    expect(el.textContent).toContain('Następne odnowienie');
    expect(el.textContent).not.toContain('Rezygnacja zaplanowana');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).toContain('Zrezygnuj z usługi');
  });
});

/**
 * K3 — limity ustalone przez obsługę dla tej usługi: klient widzi je w zakładce „Subskrypcja i płatności” obok planu,
 * bez słowa „custom” i nazw infrastruktury; bez nadpisań sekcji nie ma.
 */
describe('ServiceSubscriptionTab — limity ustalone indywidualnie', () => {
  it('lista nadpisanych limitów z wartością z planu i drogą do obsługi przy zmianie planu', async () => {
    await zamontuj(
      usluga({
        limityIndywidualne: [
          { pole: 'diskLimitMb', etykieta: 'Dysk', plan: 51200, nadpisanie: 102400, efektywny: 102400 },
          { pole: 'emailAccounts', etykieta: 'Skrzynki e-mail', plan: null, nadpisanie: 100, efektywny: 100 },
        ],
      }),
    );
    const sekcja = el.querySelector('[data-sekcja="limity-indywidualne"]')!;
    expect(sekcja.textContent).toContain('Limity ustalone indywidualnie');
    expect(sekcja.textContent).toContain('Dysk100 GBw planie: 50 GB');
    expect(sekcja.textContent).toContain('Skrzynki e-mail100w planie: bez limitu');
    expect(sekcja.textContent).toContain('Zmianę planu przeprowadzi obsługa');
    expect(sekcja.textContent).not.toMatch(/custom|DirectAdmin|LVE/i);
  });

  it('bez nadpisań — bez sekcji', async () => {
    await zamontuj(usluga({ limityIndywidualne: [] }));
    expect(el.querySelector('[data-sekcja="limity-indywidualne"]')).toBeNull();
  });
});


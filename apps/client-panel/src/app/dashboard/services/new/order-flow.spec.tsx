/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlanDto } from '@verris/contracts';

/**
 * Q-05 — pakiety Newsletter w zamówieniu: widoczne tylko przy włączonej fladze e-mail marketingu,
 * bez kroku domeny, z limitami kontaktów i wysyłek; po zakupie klient trafia do przestrzeni
 * e-mail marketingu. Bez flagi zamówienie wygląda jak dotąd.
 */
const mockFlags = { emailMarketing: false };
/** Odpowiedź API /me/feature-flags — VPS włącza API per konto, nie build panelu. */
const mockApi = { value: {} as Record<string, boolean> };
const mockParams = { value: new URLSearchParams() };
const mockPush = jest.fn();
const mockCreate = jest.fn();
jest.mock('@/lib/client-features', () => ({ clientFeatures: mockFlags }));
jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: async () => mockApi.value }));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams.value,
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('./actions', () => ({
  createSubscriptionAction: (...a: unknown[]) => mockCreate(...a),
  getTrialEligibilityAction: async () => ({ eligible: false }),
}));
jest.mock('./promo-actions', () => ({ previewSubscriptionPromoAction: jest.fn() }));
jest.mock('./domain-step', () => ({ DomainStep: () => <div>KROK-DOMENY</div> }));
jest.mock('./trial-callout', () => ({ TrialCallout: () => null }));
jest.mock('@/app/dashboard/domains/actions', () => ({
  abonentZProfiluAction: jest.fn(),
  getWaiverConsentAction: jest.fn(),
  registerDomainClientAction: jest.fn(),
}));
jest.mock('@/app/dashboard/domains/components/registrant-fields', () => ({
  RegistrantFields: () => null,
  PUSTY_ABONENT: {},
  brakiAbonenta: () => [],
}));
jest.mock('@/lib/analytics-events', () => ({ trackBeginCheckout: jest.fn(), trackPurchase: jest.fn() }));

import { OrderFlow } from './order-flow';
import { FeatureFlagsProvider } from '@/lib/feature-flags';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const plan = (over: Partial<PlanDto>): PlanDto => ({
  id: 'p', slug: 'p', name: 'P', description: null, cpuLimit: 1, ramLimitMb: 1, diskLimitMb: 1, ioLimitKbps: 1, iopsLimit: 1,
  entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: '45.00', priceYearly: '399.00', currency: 'PLN',
  isPublic: true, isActive: true, sortOrder: 1, trialDays: 0, productKind: 'HOSTING', supportSlaHours: 0, ...over,
});
const PLANY = [
  plan({ id: 'h1', slug: 'verris-hosting', name: 'Hosting Verris', cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 }),
  plan({ id: 'n1', slug: 'newsletter-start', name: 'Newsletter Start', productKind: 'EMAIL_MARKETING', priceMonthly: '19.00', priceYearly: '190.00', emmMaxContacts: 1000, emmMonthlySends: 5000 }),
  plan({ id: 'n2', slug: 'newsletter-plus', name: 'Newsletter Plus', productKind: 'EMAIL_MARKETING', priceMonthly: '49.00', priceYearly: '490.00', emmMaxContacts: 5000, emmMonthlySends: 25000 }),
];
const OFERTA = { freeEnabled: false, cardEnabled: false, annualDiscountPct: 0, monthlyDiscountPct: 0, annualPromoCode: '', monthlyPromoCode: '' };

let root: Root;
let el: HTMLDivElement;
async function pokaz(query: string, flaga: boolean) {
  mockFlags.emailMarketing = flaga;
  mockParams.value = new URLSearchParams(query);
  await act(async () =>
    root.render(
      <FeatureFlagsProvider>
        <OrderFlow plans={PLANY} offer={OFERTA} />
      </FeatureFlagsProvider>,
    ),
  );
  return el.textContent ?? '';
}

beforeEach(() => {
  mockApi.value = {};
  mockPush.mockReset();
  mockCreate.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

it('flaga wyłączona: brak kafla e-mail marketingu, a ?type=newsletter zostaje na wyborze typu', async () => {
  expect(await pokaz('', false)).not.toContain('E-mail marketing');
  const t = await pokaz('type=newsletter', false);
  expect(t).toContain('Co chcesz uruchomić?');
  expect(t).not.toContain('Newsletter Start');
});

it('flaga włączona: kafel prowadzi do pakietów Newsletter z limitami, bez kroku domeny i bez hostingu', async () => {
  expect(await pokaz('', true)).toContain('E-mail marketing');
  expect(el.querySelector('a[href="/dashboard/services/new?type=newsletter"]')).not.toBeNull();

  const t = await pokaz('type=newsletter', true);
  expect(t).toContain('Newsletter Start');
  expect(t).toContain('Newsletter Plus');
  expect(t).toMatch(/Do 1\s?000 kontaktów/);
  expect(t).toMatch(/25\s?000 wysyłek miesięcznie/);
  expect(t).not.toContain('KROK-DOMENY');
  expect(t).not.toContain('Hosting Verris');
  expect(t).not.toContain('Autoskalowanie');
});

it('zakup pakietu: zamówienie bez domeny, potem przestrzeń e-mail marketingu', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 'sub-9' } } });
  await pokaz('type=newsletter', true);
  const zgoda = [...el.querySelectorAll('input')].find((i) => i.type === 'checkbox')!;
  await act(async () => void zgoda.click());
  const zamow = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Zamów i opłać'))!;
  expect(zamow.disabled).toBe(false);
  await act(async () => void zamow.click());
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ planId: 'n1', paymentSource: 'WALLET', domain: undefined, ecoModeEnabled: false }));
  expect(mockPush).toHaveBeenCalledWith('/dashboard/email-marketing/sub-9');
});

it('VPS w zamówieniu tylko, gdy API zwraca vps=true dla konta', async () => {
  expect(await pokaz('', false)).not.toContain('VPS');
  expect(el.querySelector('a[href="/dashboard/services/new?type=vps"]')).toBeNull();
  expect(await pokaz('type=vps', false)).not.toContain('Otwórz sekcję VPS');

  mockApi.value = { vps: true };
  await act(async () => root.unmount());
  root = createRoot(el);
  expect(await pokaz('', false)).toContain('VPS');
  expect(el.querySelector('a[href="/dashboard/services/new?type=vps"]')).not.toBeNull();
  expect(await pokaz('type=vps', false)).toContain('Otwórz sekcję VPS');
});

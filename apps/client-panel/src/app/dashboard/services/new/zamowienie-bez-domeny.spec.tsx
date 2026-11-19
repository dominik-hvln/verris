/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlanDto } from '@verris/contracts/klient';

/**
 * Paczka 129 (feedback bety 19.11.2026, pkt 1) – „brak opcji zakupu samego hostingu, zawsze wymuszana domena”.
 * Krok domeny ma trzecią opcję „Bez domeny – użyję adresu technicznego”, tylko dla hostingu i tylko gdy API ma
 * skonfigurowaną domenę techniczną. Zamówienie idzie wtedy z `bezDomeny: true` i bez `domain`.
 */
const mockParams = { value: new URLSearchParams('type=hosting') };
const mockCreate = jest.fn();
jest.mock('@/lib/client-features', () => ({ clientFeatures: { emailMarketing: false } }));
jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: async () => ({}) }));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams.value,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('./actions', () => ({
  createSubscriptionAction: (...a: unknown[]) => mockCreate(...a),
  getTrialEligibilityAction: async () => ({ eligible: false }),
}));
jest.mock('./promo-actions', () => ({ previewSubscriptionPromoAction: jest.fn() }));
jest.mock('./trial-callout', () => ({ TrialCallout: () => null }));
jest.mock('@/app/dashboard/domains/actions', () => ({
  abonentZProfiluAction: jest.fn(async () => ({})),
  registerDomainClientAction: jest.fn(),
  searchDomainsAction: jest.fn(),
}));
jest.mock('@/app/dashboard/domains/components/registrant-fields', () => ({
  RegistrantFields: () => null,
  PUSTY_ABONENT: {},
  brakiAbonenta: () => [],
}));
jest.mock('@/lib/analytics-events', () => ({ trackBeginCheckout: jest.fn(), trackPurchase: jest.fn() }));

import { OrderFlow } from './order-flow';
import type { TrialOffer } from '../data';
import { FeatureFlagsProvider } from '@/lib/feature-flags';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = jest.fn();

const plan = (over: Partial<PlanDto>): PlanDto => ({
  id: 'p', slug: 'p', name: 'P', description: null, cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240, ioLimitKbps: 1, iopsLimit: 1,
  entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: '45.00', priceYearly: '449.00', currency: 'PLN',
  isPublic: true, isActive: true, sortOrder: 1, trialDays: 0, productKind: 'HOSTING', supportSlaHours: 0, ...over,
});
const HOSTING = plan({ id: 'h1', name: 'Hosting Verris' });
const POCZTA = plan({ id: 'e1', name: 'Poczta Verris', productKind: 'EMAIL' });
const OFERTA: TrialOffer = { freeEnabled: false, cardEnabled: false, annualAutoscalingCredit: 0, monthlyAutoscalingCredit: 0 };
const OPCJA = 'Bez domeny – użyję adresu technicznego';

let root: Root;
let el: HTMLDivElement;
async function pokaz(o: { bezDomenyDostepne?: boolean; typ?: string; plans?: PlanDto[] } = {}) {
  mockParams.value = new URLSearchParams(`type=${o.typ ?? 'hosting'}`);
  await act(async () =>
    root.render(
      <FeatureFlagsProvider>
        <OrderFlow plans={o.plans ?? [HOSTING, POCZTA]} offer={OFERTA} bezDomenyDostepne={o.bezDomenyDostepne} />
      </FeatureFlagsProvider>,
    ),
  );
}
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst)) as HTMLButtonElement | undefined;
const klik = (e: HTMLElement) => act(async () => void e.click());

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ ok: true, data: { subscription: { id: 'sub-1' }, provisioningQueued: true } });
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

it('bez domeny technicznej w API opcji nie ma (jak dotąd: własna albo nowa domena)', async () => {
  await pokaz({ bezDomenyDostepne: false });
  expect(przycisk(OPCJA)).toBeUndefined();
  expect(przycisk('Mam własną domenę')).toBeDefined();
});

it('poczta nie ma opcji bez domeny, nawet gdy funkcja jest włączona', async () => {
  await pokaz({ bezDomenyDostepne: true, typ: 'email' });
  expect(przycisk('Mam własną domenę')).toBeDefined();
  expect(przycisk(OPCJA)).toBeUndefined();
});

it('hosting bez domeny: nie trzeba wpisywać domeny, zamówienie idzie z bezDomeny i bez domain', async () => {
  await pokaz({ bezDomenyDostepne: true });
  expect(el.querySelector('#braki-zamowienia')?.textContent).toContain('wpisz domenę');

  await klik(przycisk(OPCJA)!);
  expect(przycisk(OPCJA)!.getAttribute('aria-pressed')).toBe('true');
  expect(el.querySelector('#domena-wlasna')).toBeNull();
  expect(el.textContent).toContain('Konto założymy na adresie technicznym usługi');
  expect(el.querySelector('#braki-zamowienia')?.textContent ?? '').not.toContain('domen');
  // White label: żadnych nazw panelu serwera ani węzłów w tekstach zamówienia.
  expect(el.textContent).not.toMatch(/DirectAdmin|\bDA\b|2222|węz/);

  for (const id of ['zgoda-regulamin', 'zgoda-swiadczenie']) await klik(el.querySelector(`#${id}`) as HTMLElement);
  await klik(przycisk('Zamów i opłać')!);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  const wyslane = mockCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(wyslane).toMatchObject({ planId: 'h1', bezDomeny: true });
  expect(wyslane.domain).toBeUndefined();
});

it('powrót do „Mam własną domenę” – znów wymagana domena i bez flagi bezDomeny', async () => {
  await pokaz({ bezDomenyDostepne: true });
  await klik(przycisk(OPCJA)!);
  await klik(przycisk('Mam własną domenę')!);
  expect(el.querySelector('#domena-wlasna')).not.toBeNull();
  expect(el.querySelector('#braki-zamowienia')?.textContent).toContain('wpisz domenę');
});

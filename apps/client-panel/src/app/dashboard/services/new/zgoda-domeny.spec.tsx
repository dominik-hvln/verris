/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlanDto } from '@verris/contracts/klient';

/**
 * Decyzja 21 (4.11.2026) — oświadczenie o natychmiastowej rejestracji domeny i utracie prawa odstąpienia przy KAŻDYM
 * zamówieniu (art. 38 ust. 1 pkt 1 upk, Regulamin §12 ust. 8). Na starym kodzie formularz pytał API o oświadczenie
 * „na stałe” (getWaiverConsentAction) i zamiast checkboxa pokazywał przypomnienie, zaznaczając zgodę sam.
 */
const mockPush = jest.fn();
const mockCreate = jest.fn();
const mockRegister = jest.fn();
jest.mock('@/lib/client-features', () => ({ clientFeatures: { emailMarketing: false } }));
jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: async () => ({}) }));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('type=hosting'),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('./actions', () => ({
  createSubscriptionAction: (...a: unknown[]) => mockCreate(...a),
  getTrialEligibilityAction: async () => ({ eligible: false }),
}));
jest.mock('./promo-actions', () => ({ previewSubscriptionPromoAction: jest.fn() }));
jest.mock('./trial-callout', () => ({ TrialCallout: () => null }));
// Krok domeny jako atrapa: dwa przyciski wybierające domenę do rejestracji.
jest.mock('./domain-step', () => ({
  DomainStep: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <div>
      {['nowa.pl', 'inna.pl'].map((d) => (
        <button key={d} type="button" onClick={() => onChange({ mode: 'register', domain: d, register: { name: d, years: 1 } })}>
          WYBIERZ {d}
        </button>
      ))}
    </div>
  ),
}));
jest.mock('@/app/dashboard/domains/actions', () => ({
  abonentZProfiluAction: jest.fn(async () => ({})),
  // Stary mechanizm „na stałe”: konto z wcześniejszym zakupem domeny. Nowy kod nie może z tego korzystać.
  getWaiverConsentAction: jest.fn(async () => ({ granted: true, grantedAt: '2026-10-01T10:00:00.000Z' })),
  registerDomainClientAction: (...a: unknown[]) => mockRegister(...a),
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

const HOSTING: PlanDto = {
  id: 'h1', slug: 'verris-hosting', name: 'Hosting Verris', description: null, cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200,
  ioLimitKbps: 1, iopsLimit: 1, entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: '45.00', priceYearly: '449.00',
  currency: 'PLN', isPublic: true, isActive: true, sortOrder: 1, trialDays: 0, productKind: 'HOSTING', supportSlaHours: 0,
};
const OFERTA: TrialOffer = { freeEnabled: false, cardEnabled: false, annualDiscountPct: 0, monthlyDiscountPct: 0, annualPromoCode: '', monthlyPromoCode: '' };

let root: Root;
let el: HTMLDivElement;
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst)) as HTMLButtonElement;
const pole = (id: string) => el.querySelector(`#${id}`) as HTMLInputElement | null;
const klik = (e: HTMLElement) => act(async () => void e.click());

beforeEach(async () => {
  mockPush.mockReset();
  mockCreate.mockReset().mockResolvedValue({ ok: true, data: { subscription: { id: 'sub-1' } } });
  mockRegister.mockReset().mockResolvedValue({ ok: true, data: { id: 'o1' } });
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () =>
    root.render(
      <FeatureFlagsProvider>
        <OrderFlow plans={[HOSTING]} offer={OFERTA} />
      </FeatureFlagsProvider>,
    ),
  );
});
afterEach(() => act(() => root.unmount()));

it('rejestracja domeny w zamówieniu: checkbox oświadczenia zawsze widoczny i niezaznaczony, bez „kolejnych rejestracji”', async () => {
  await klik(przycisk('WYBIERZ nowa.pl'));
  const zgoda = pole('zgoda-domena');
  expect(zgoda).not.toBeNull();
  expect(zgoda!.checked).toBe(false);
  expect(el.textContent).not.toMatch(/kolejne rejestracje|wcześniejsze oświadczenie/);
  expect(el.querySelector('#braki-zamowienia')?.textContent).toContain('zaznacz oświadczenie o rejestracji domeny');
});

it('bez zaznaczenia zamówienie nie idzie; po zaznaczeniu rejestracja niesie oświadczenie z tego zamówienia', async () => {
  await klik(przycisk('WYBIERZ nowa.pl'));
  for (const id of ['zgoda-regulamin', 'zgoda-swiadczenie']) await klik(pole(id)!);
  await klik(przycisk('Zarejestruj domenę, zamów i opłać'));
  expect(mockRegister).not.toHaveBeenCalled();

  await klik(pole('zgoda-domena')!);
  await klik(przycisk('Zarejestruj domenę, zamów i opłać'));
  expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ name: 'nowa.pl', withdrawalWaiverConsent: true }));
});

it('zmiana domeny do rejestracji kasuje zaznaczone oświadczenie (dotyczy konkretnego zamówienia)', async () => {
  await klik(przycisk('WYBIERZ nowa.pl'));
  await klik(pole('zgoda-domena')!);
  expect(pole('zgoda-domena')!.checked).toBe(true);
  await klik(przycisk('WYBIERZ inna.pl'));
  expect(pole('zgoda-domena')!.checked).toBe(false);
});

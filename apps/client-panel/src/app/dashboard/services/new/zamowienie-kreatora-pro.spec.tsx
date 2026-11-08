/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlanDto } from '@verris/contracts/klient';

/**
 * Paczka 121 — abonament Kreator Pro tym samym formularzem zamówienia co inne usługi (/dashboard/kreator/pro):
 * okres z ceną brutto i netto, portfel albo karta, bez kroku domeny i opcji hostingu, informacje przedumowne
 * wskazują, gdzie wyłączyć odnowienie; po zakupie z portfela – z powrotem na kartę Kreatora Pro.
 */
const mockPush = jest.fn();
const mockCreate = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('./actions', () => ({ createSubscriptionAction: (...a: unknown[]) => mockCreate(...a) }));
jest.mock('./promo-actions', () => ({ previewSubscriptionPromoAction: jest.fn() }));
jest.mock('./domain-step', () => ({ DomainStep: () => <div>KROK-DOMENY</div> }));
jest.mock('@/app/dashboard/domains/actions', () => ({ abonentZProfiluAction: jest.fn(), registerDomainClientAction: jest.fn() }));
jest.mock('@/app/dashboard/domains/components/registrant-fields', () => ({ RegistrantFields: () => null, PUSTY_ABONENT: {}, brakiAbonenta: () => [] }));
jest.mock('@/lib/analytics-events', () => ({ trackBeginCheckout: jest.fn(), trackPurchase: jest.fn() }));

import { NewSubscriptionForm } from './form';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PRO: PlanDto = {
  id: 'pro', slug: 'kreator-pro', name: 'Verris Kreator Pro', description: 'Rozszerzona wersja Verris Kreatora.', cpuLimit: 1, ramLimitMb: 1,
  diskLimitMb: 1, ioLimitKbps: 1, iopsLimit: 1, entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: '9.90',
  priceYearly: '99.00', currency: 'PLN', isPublic: true, isActive: true, sortOrder: 30, trialDays: 0, productKind: 'KREATOR_PRO', supportSlaHours: 0,
};

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  mockPush.mockReset();
  mockCreate.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

async function pokaz(initialInterval: 'MONTH' | 'YEAR' = 'YEAR') {
  await act(async () => root.render(<NewSubscriptionForm plans={[PRO]} initialInterval={initialInterval} />));
  return (el.textContent ?? '').replace(/\s+/g, ' ');
}

it('bez domeny i opcji hostingu; cena brutto i netto, oszczędność roczna, gdzie wyłączyć odnowienie', async () => {
  const t = await pokaz('YEAR');
  expect(t).toContain('Verris Kreator Pro');
  expect(t).not.toContain('KROK-DOMENY');
  expect(t).not.toContain('Autoskalowanie');
  expect(t).not.toContain('Tryb EKO');
  expect(t).toMatch(/99,00\s?zł brutto/);
  expect(t).toMatch(/80,49\s?zł netto/);
  expect(t).toContain('oszczędzasz');
  expect(t).toContain('na stronie Kreator stron');
});

it('zakup z portfela: zamówienie bez domeny, potem karta Kreatora Pro', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 'sub-pro' } } });
  await pokaz('MONTH');
  for (const i of [...el.querySelectorAll('input')].filter((x) => x.type === 'checkbox')) {
    if (!i.checked) await act(async () => void i.click());
  }
  const zamow = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Zamów i opłać'))!;
  await act(async () => void zamow.click());
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ planId: 'pro', interval: 'MONTH', paymentSource: 'WALLET', domain: undefined, autoscalingEnabled: false, ecoModeEnabled: false }),
  );
  expect(mockPush).toHaveBeenCalledWith('/dashboard/kreator#kreator-pro');
});

import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * 14.10 (PB-08): przy płatności kartą klient zostaje na stronie faktury Stripe i nie wraca do panelu, więc `purchase`
 * nie trafiał do GA4. Teraz wysyła go serwer (Measurement Protocol) przy pierwszej aktywacji po `invoice.paid` —
 * tylko z identyfikatorem klienta GA4 zapisanym przy zamówieniu (panel przekazuje go wyłącznie przy zgodzie na
 * analitykę) i tylko przy skonfigurowanym GA4.
 */
let konfiguracja: Record<string, string | undefined> = {};
const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response);

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const kolejka = { isAsync: () => true, enqueueStripeProvision: async () => undefined };
  return new SubscriptionsService(
    p, audit, new WalletLedgerService(p), null as never, null as never, kolejka as never, null as never,
    { send: async () => ({}) } as never, { get: (k: string) => konfiguracja[k] } as never, null as never,
    { safeAward: () => undefined } as never, null as never, null as never,
  );
}

async function zamowienieKarta(gaClientId: string | null) {
  const plan = await utworzPlan({ name: 'Hosting Verris', priceMonthly: 45 } as never);
  const u = await prisma().user.create({ data: { email: `karta-${Date.now()}-${Math.random()}@test.verris.pl`, passwordHash: 'x' } });
  const stripeSubscriptionId = `sub_${Math.random().toString(36).slice(2, 12)}`;
  const sub = await prisma().subscription.create({
    data: {
      userId: u.id, planId: plan.id, status: 'PENDING_PAYMENT', interval: 'MONTH', priceAmount: 45,
      paymentSource: 'STRIPE_CARD', stripeSubscriptionId,
    },
  });
  await prisma().subscriptionEvent.create({
    data: { subscriptionId: sub.id, type: 'PROVISIONING_INTENT', details: { domain: 'sklep-karta.pl', preferredRegion: null, gaClientId } },
  });
  return { sub, stripeSubscriptionId };
}

describe('Stripe: purchase do GA4 z serwera po pierwszej płatności kartą', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    konfiguracja = { GA4_MEASUREMENT_ID: 'G-TEST123', GA4_API_SECRET: 'sekret-testowy' };
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(rozlacz);

  it('ze zgodą (client_id przy zamówieniu): jeden purchase z ID usługi i kwotą, kolejny webhook już nie wysyła', async () => {
    const { sub, stripeSubscriptionId } = await zamowienieKarta('1234567890.1697000000');
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=sekret-testowy');
    const body = JSON.parse(String(init.body));
    expect(body.client_id).toBe('1234567890.1697000000');
    expect(body.events[0]).toMatchObject({
      name: 'purchase',
      params: { transaction_id: sub.id, value: 45, currency: 'PLN', items: [expect.objectContaining({ item_name: 'Hosting Verris' })] },
    });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PROVISIONING');

    await uslugi().activateAfterStripePayment({ stripeSubscriptionId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bez zgody (brak client_id) albo bez konfiguracji GA4: nic nie wysyła, aktywacja idzie dalej', async () => {
    const bezZgody = await zamowienieKarta(null);
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId: bezZgody.stripeSubscriptionId });
    konfiguracja = {};
    const bezKonfiguracji = await zamowienieKarta('1234567890.1697000000');
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId: bezKonfiguracji.stripeSubscriptionId });
    expect(fetchMock).not.toHaveBeenCalled();
    for (const { sub } of [bezZgody, bezKonfiguracji]) {
      expect((await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PROVISIONING');
    }
  });

  it('GA4 nie odpowiada: aktywacja i tak idzie dalej', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const { sub, stripeSubscriptionId } = await zamowienieKarta('1234567890.1697000000');
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId });
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('PROVISIONING');
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { BillingService } from '../billing/billing.service.js';
import { StripeClient, getInvoiceSubscriptionMetadata } from '../billing/stripe/stripe.client.js';

/**
 * 19.10 (smoke PB-31) — pierwsza płatność za usługę kartą: Stripe Checkout (tryb `subscription`) z powrotem na stronę
 * usługi zamiast Hosted Invoice Page, z której klient nie wracał do panelu.
 */

const n = {} as never;

function uslugi(opts: { sesje?: Array<{ id: string; status: string; url?: string }>; sub?: Record<string, unknown> } = {}) {
  const zdarzenia = (opts.sesje ?? []).map((s) => ({ details: { sessionId: s.id } }));
  const sub = {
    id: 's1',
    userId: 'u1',
    planId: 'p1',
    interval: 'MONTH',
    status: 'PENDING_PAYMENT',
    paymentSource: 'STRIPE_CARD',
    stripeSubscriptionId: null,
    appliedPromoCodeId: null,
    account: null,
    currentPeriodEnd: null,
    ...opts.sub,
  };
  const prisma = {
    subscription: {
      findFirst: vi.fn(async () => sub),
      findUnique: vi.fn(async () => sub),
      findUniqueOrThrow: vi.fn(async () => sub),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => sub),
    },
    subscriptionEvent: {
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => zdarzenia),
      findFirst: vi.fn(async () => ({ details: { domain: 'x.pl', preferredRegion: null } })),
    },
    plan: { findUnique: vi.fn(async () => ({ id: 'p1', slug: 'hosting', stripePriceMonthlyId: 'price_m', stripePriceYearlyId: 'price_y' })) },
    user: {
      findUnique: vi.fn(async () => ({ id: 'u1', email: 'a@b.pl', firstName: null, lastName: null, companyName: null, stripeCustomerId: 'cus_1' })),
    },
  };
  const stripe = {
    createSubscriptionCheckoutSession: vi.fn(async () => ({ id: 'cs_nowa', url: 'https://checkout.stripe.test/cs_nowa' })),
    retrieveCheckoutSession: vi.fn(async (id: string) => {
      const s = (opts.sesje ?? []).find((x) => x.id === id);
      return { id, status: s?.status ?? 'expired', url: s?.url ?? null };
    }),
    expireCheckoutSession: vi.fn(async () => ({})),
    cancelSubscription: vi.fn(async () => ({})),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: vi.fn((k: string) => (k === 'CLIENT_PANEL_URL' ? 'https://panel.test/' : undefined)) };
  const promo = { zwolnijKodUslugi: vi.fn(async () => undefined) };
  const svc = new SubscriptionsService(prisma as never, audit as never, n, stripe as never, n, n, n, n, config as never, promo as never, n, n, n);
  return { svc, prisma, stripe, audit, sub };
}

describe('Płatność kartą za usługę przez Stripe Checkout', () => {
  it('zamówienie kartą tworzy sesję Checkout z powrotem na stronę usługi, nie subskrypcję z fakturą Stripe', async () => {
    const { svc, stripe, prisma } = uslugi();
    const plan = { id: 'p1', slug: 'hosting', stripePriceMonthlyId: 'price_m', stripePriceYearlyId: 'price_y' };
    const wynik = await (svc as unknown as {
      startStripeRecurring(id: string, p: unknown, d: unknown, u: string): Promise<{ checkoutRedirectUrl?: string }>;
    }).startStripeRecurring('s1', plan, { interval: 'MONTH', domain: 'x.pl' }, 'u1');

    expect(wynik.checkoutRedirectUrl).toBe('https://checkout.stripe.test/cs_nowa');
    expect(stripe.createSubscriptionCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        priceId: 'price_m',
        successUrl: 'https://panel.test/dashboard/services/s1?platnosc=karta',
        cancelUrl: 'https://panel.test/dashboard/services/s1?tab=subscription',
        metadata: expect.objectContaining({ kind: 'subscription', verrisSubscriptionId: 's1' }),
        subscriptionMetadata: expect.objectContaining({ verrisSubscriptionId: 's1', verrisUserId: 'u1', domain: 'x.pl' }),
      }),
    );
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
      data: { subscriptionId: 's1', type: 'STRIPE_CHECKOUT', details: { sessionId: 'cs_nowa' } },
    });
  });

  it('ponowienie płatności: otwarta sesja wraca bez nowej; opłacona — odmowa; wygasła — nowa sesja', async () => {
    const otwarta = uslugi({ sesje: [{ id: 'cs_1', status: 'open', url: 'https://checkout.stripe.test/cs_1' }] });
    await expect(otwarta.svc.getPaymentRetryUrl('u1', 's1')).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_1' });
    expect(otwarta.stripe.createSubscriptionCheckoutSession).not.toHaveBeenCalled();

    const oplacona = uslugi({ sesje: [{ id: 'cs_1', status: 'complete' }] });
    await expect(oplacona.svc.getPaymentRetryUrl('u1', 's1')).rejects.toThrow(BadRequestException);
    expect(oplacona.stripe.createSubscriptionCheckoutSession).not.toHaveBeenCalled();

    const wygasla = uslugi({ sesje: [{ id: 'cs_1', status: 'expired' }] });
    await expect(wygasla.svc.getPaymentRetryUrl('u1', 's1')).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_nowa' });
    expect(wygasla.stripe.createSubscriptionCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_m', subscriptionMetadata: expect.objectContaining({ domain: 'x.pl' }) }),
    );
  });

  it('anulowanie zamówienia zamyka otwartą sesję; opłaconej sesji nie anuluje', async () => {
    const otwarta = uslugi({ sesje: [{ id: 'cs_1', status: 'open' }] });
    (otwarta.svc as unknown as { tearDownCanceledSubscription: unknown }).tearDownCanceledSubscription = vi.fn(async () => otwarta.sub);
    await otwarta.svc.cancel('u1', 's1');
    expect(otwarta.stripe.expireCheckoutSession).toHaveBeenCalledWith('cs_1');

    const oplacona = uslugi({ sesje: [{ id: 'cs_1', status: 'complete' }] });
    const zwijanie = vi.fn(async () => oplacona.sub);
    (oplacona.svc as unknown as { tearDownCanceledSubscription: unknown }).tearDownCanceledSubscription = zwijanie;
    await expect(oplacona.svc.cancel('u1', 's1')).rejects.toThrow(ConflictException);
    expect(zwijanie).not.toHaveBeenCalled();
  });

  it('checkout.session.completed zapisuje subskrypcję Stripe; dla anulowanego zamówienia anuluje ją i zostawia alarm', async () => {
    const zwykle = uslugi();
    await zwykle.svc.powiazSubskrypcjeZCheckout({ verrisSubscriptionId: 's1', stripeSubscriptionId: 'sub_1', sessionId: 'cs_1' });
    expect(zwykle.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', stripeSubscriptionId: null },
      data: { stripeSubscriptionId: 'sub_1' },
    });
    expect(zwykle.stripe.cancelSubscription).not.toHaveBeenCalled();

    const anulowane = uslugi({ sub: { status: 'CANCELED' } });
    await anulowane.svc.powiazSubskrypcjeZCheckout({ verrisSubscriptionId: 's1', stripeSubscriptionId: 'sub_1', sessionId: 'cs_1' });
    expect(anulowane.stripe.cancelSubscription).toHaveBeenCalledWith('sub_1', { atPeriodEnd: false });
    expect(anulowane.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STRIPE_CHECKOUT_DO_ZWROTU' }));
    expect(anulowane.prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

describe('Webhooki Stripe dla Checkout w trybie subskrypcji', () => {
  function billing() {
    const subs = {
      powiazSubskrypcjeZCheckout: vi.fn(async () => null),
      findByStripeSubscriptionId: vi.fn(async () => null),
      activateAfterStripePayment: vi.fn(async () => null),
    };
    const invoices = { upsertFromStripe: vi.fn(async () => ({ invoice: { id: 'i1' }, created: false })) };
    const doladowanie = { zaksieguj: vi.fn() };
    const prisma = { user: { findUnique: vi.fn(async () => null) } };
    const svc = new BillingService(prisma as never, n, n, n, n, invoices as never, subs as never, n, n, n, doladowanie as never);
    const wywolaj = (type: string, object: Record<string, unknown>) =>
      (svc as unknown as { rozdzielZdarzenie(e: unknown): Promise<void> }).rozdzielZdarzenie({ id: 'evt', type, data: { object } });
    return { subs, invoices, doladowanie, wywolaj };
  }

  it('checkout.session.completed (kind=subscription) wiąże subskrypcję i nie księguje doładowania portfela', async () => {
    const b = billing();
    await b.wywolaj('checkout.session.completed', {
      id: 'cs_1',
      mode: 'subscription',
      payment_status: 'paid',
      amount_total: 4500,
      currency: 'pln',
      client_reference_id: 'u1',
      subscription: 'sub_1',
      metadata: { kind: 'subscription', verrisSubscriptionId: 's1', verrisUserId: 'u1' },
    });
    expect(b.subs.powiazSubskrypcjeZCheckout).toHaveBeenCalledWith({ verrisSubscriptionId: 's1', stripeSubscriptionId: 'sub_1', sessionId: 'cs_1' });
    expect(b.doladowanie.zaksieguj).not.toHaveBeenCalled();
  });

  it('invoice.paid przed powiązaniem: zamówienie z metadanych subskrypcji w parent.subscription_details', async () => {
    const b = billing();
    const faktura = {
      id: 'in_1',
      status: 'paid',
      customer: 'cus_1',
      metadata: {},
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_1', metadata: { verrisSubscriptionId: 's1', verrisUserId: 'u1' } },
      },
      status_transitions: { paid_at: 1_760_000_000 },
    };
    expect(getInvoiceSubscriptionMetadata(faktura as never)).toEqual({ verrisSubscriptionId: 's1', verrisUserId: 'u1' });
    await b.wywolaj('invoice.payment_succeeded', faktura);
    expect(b.invoices.upsertFromStripe).toHaveBeenCalledWith(faktura, { verrisUserId: 'u1', verrisSubscriptionId: 's1' });
    expect(b.subs.activateAfterStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: 'sub_1', metadataSubscriptionId: 's1', stripeInvoiceId: 'in_1' }),
    );
  });
});

describe('StripeClient: sesja Checkout subskrypcji', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('wysyła tryb subscription, cenę, adresy powrotu i metadane subskrypcji; expire to POST na …/expire', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'cs_1', url: 'https://x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const c = new StripeClient('sk_test_x');
    await c.createSubscriptionCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_m',
      successUrl: 'https://panel.test/ok',
      cancelUrl: 'https://panel.test/nie',
      clientReferenceId: 'u1',
      metadata: { kind: 'subscription', verrisSubscriptionId: 's1' },
      subscriptionMetadata: { verrisSubscriptionId: 's1' },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toMatch(/\/checkout\/sessions$/);
    const body = new URLSearchParams(init.body);
    expect(body.get('mode')).toBe('subscription');
    expect(body.get('customer')).toBe('cus_1');
    expect(body.get('line_items[0][price]')).toBe('price_m');
    expect(body.get('success_url')).toBe('https://panel.test/ok');
    expect(body.get('cancel_url')).toBe('https://panel.test/nie');
    expect(body.get('metadata[kind]')).toBe('subscription');
    expect(body.get('subscription_data[metadata][verrisSubscriptionId]')).toBe('s1');

    await c.expireCheckoutSession('cs_1');
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, { method: string }];
    expect(url2).toMatch(/\/checkout\/sessions\/cs_1\/expire$/);
    expect(init2.method).toBe('POST');
  });
});

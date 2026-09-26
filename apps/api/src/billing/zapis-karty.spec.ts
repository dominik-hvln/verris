import { BillingService } from './billing.service.js';

/** M-26 — webhooki Stripe zapisują i sprzątają karty w PaymentMethod. */
function zbuduj(opts: { user?: { id: string } | null; maDomyslna?: number; wiersz?: Record<string, unknown> | null } = {}) {
  const prisma = {
    user: { findFirst: vi.fn(async () => (opts.user === undefined ? { id: 'u1' } : opts.user)), updateMany: vi.fn(() => 'u') },
    paymentMethod: {
      count: vi.fn(async () => opts.maDomyslna ?? 0),
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => opts.wiersz ?? null),
      delete: vi.fn(() => 'd'),
    },
    walletAutoTopup: { updateMany: vi.fn(() => 'w') },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const svc = new BillingService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const wywolaj = (type: string, object: Record<string, unknown>) =>
    (svc as unknown as { rozdzielZdarzenie(e: unknown): Promise<void> }).rozdzielZdarzenie({ id: 'evt', type, data: { object } });
  return { prisma, wywolaj };
}

const karta = { id: 'pm_1', type: 'card', customer: 'cus_1', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } };

describe('M-26 zapis kart z webhooków', () => {
  it('attached: pierwsza karta klienta zostaje zapisana jako domyślna', async () => {
    const { prisma, wywolaj } = zbuduj();
    await wywolaj('payment_method.attached', karta);
    expect(prisma.paymentMethod.upsert).toHaveBeenCalledWith({
      where: { provider_providerRef: { provider: 'STRIPE', providerRef: 'pm_1' } },
      create: { userId: 'u1', provider: 'STRIPE', providerRef: 'pm_1', isDefault: true, brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
      update: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
    });
  });

  it('attached: kolejna karta nie przejmuje domyślnej; BLIK/P24 i nieznany klient są pomijane', async () => {
    const a = zbuduj({ maDomyslna: 1 });
    await a.wywolaj('payment_method.attached', karta);
    expect((a.prisma.paymentMethod.upsert.mock.calls[0] as unknown as [{ create: { isDefault: boolean } }])[0].create.isDefault).toBe(false);
    const b = zbuduj();
    await b.wywolaj('payment_method.attached', { ...karta, type: 'p24' });
    const c = zbuduj({ user: null });
    await c.wywolaj('payment_method.attached', karta);
    expect(b.prisma.paymentMethod.upsert).not.toHaveBeenCalled();
    expect(c.prisma.paymentMethod.upsert).not.toHaveBeenCalled();
  });

  it('detached: usuwa kartę i odpina ją od domyślnej i auto-doładowania', async () => {
    const { prisma, wywolaj } = zbuduj({ wiersz: { id: 'row1', userId: 'u1' } });
    await wywolaj('payment_method.detached', { id: 'pm_1' });
    expect(prisma.paymentMethod.delete).toHaveBeenCalledWith({ where: { id: 'row1' } });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', defaultPaymentMethodId: 'pm_1' }, data: { defaultPaymentMethodId: null } });
    expect(prisma.walletAutoTopup.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', paymentMethodId: 'row1' }, data: { paymentMethodId: null } });
  });
});

describe('M-27 dodanie karty bez zakupu', () => {
  it('tworzy klienta Stripe w razie potrzeby i zwraca link do Checkout w trybie setup', async () => {
    const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'a@b.pl', firstName: null, lastName: null, companyName: null, stripeCustomerId: null })) } };
    const stripe = { createSetupSession: vi.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })) };
    const subs = { ensureStripeCustomer: vi.fn(async () => 'cus_9') };
    const audit = { record: vi.fn(async () => undefined) };
    const config = { get: vi.fn(() => 'https://panel.test/') };
    const n = {} as never;
    const svc = new BillingService(prisma as never, n, stripe as never, audit as never, config as never, n, subs as never, n, n, n, n);
    await expect(svc.startAddCard('u1')).resolves.toEqual({ url: 'https://checkout.stripe.test/cs_1' });
    expect(subs.ensureStripeCustomer).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(stripe.createSetupSession).toHaveBeenCalledWith({
      customerId: 'cus_9',
      successUrl: 'https://panel.test/dashboard/billing?karta=dodana',
      cancelUrl: 'https://panel.test/dashboard/billing',
      metadata: { userId: 'u1', kind: 'add_card' },
    });
  });
});

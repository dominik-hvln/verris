import { BadRequestException } from '@nestjs/common';
import { RenewalScheduler } from './renewal.scheduler';

/** Z-07 — karencja przy płatności portfelem: doładowanie ratuje usługę przed zawieszeniem. */
function zbuduj(opts: { saldoOk: boolean; subs: Array<Record<string, unknown>> }) {
  const prisma = {
    subscription: {
      findMany: jest.fn(async () => opts.subs),
      findFirst: jest.fn(async () => opts.subs[0] ?? null),
      update: jest.fn(async () => ({})),
    },
    subscriptionEvent: { create: jest.fn(async () => ({})) },
  };
  const walletLedger = {
    findByIdempotencyKey: jest.fn(async () => null),
    debit: jest.fn(async () => {
      if (!opts.saldoOk) throw new Error('Insufficient balance');
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const promo = { resolveNextRenewalAmount: jest.fn(async () => 45) };
  const eco = { safeAward: jest.fn(), awardSubscriptionRenewal: jest.fn() };
  const s = new RenewalScheduler(prisma as never, walletLedger as never, {} as never, audit as never, promo as never, eco as never);
  return { s, prisma, walletLedger };
}

const pastDue = {
  id: 's1', userId: 'u1', status: 'PAST_DUE', paymentSource: 'WALLET', stripeSubscriptionId: null, cancelAt: null,
  currentPeriodEnd: new Date('2026-09-20T00:00:00Z'), interval: 'MONTH', plan: { slug: 'start' },
  introDiscountPeriodsLeft: 0, introDiscountPct: 0, priceAmount: 45, listPriceAmount: 45, appliedPromoCodeId: null,
};

describe('RenewalScheduler — Z-07', () => {
  it('przebieg godzinowy bierze też PAST_DUE', async () => {
    const { s, prisma } = zbuduj({ saldoOk: true, subs: [] });
    await (s as unknown as { runRenewalWindow(): Promise<void> }).runRenewalWindow();
    const where = (prisma.subscription.findMany.mock.calls[0] as unknown as [{ where: { status: { in: string[] } } }])[0].where;
    expect(where.status.in).toEqual(['ACTIVE', 'PAST_DUE']);
  });

  it('po doładowaniu PAST_DUE wraca do ACTIVE z nowym okresem', async () => {
    const { s, prisma, walletLedger } = zbuduj({ saldoOk: true, subs: [pastDue] });
    await (s as unknown as { runRenewalWindow(): Promise<void> }).runRenewalWindow();
    expect(walletLedger.debit).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'sub-s1-renew-2026-09-20' }));
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
  });

  it('nieudane ponowienie w karencji NIE zapisuje nowego PAYMENT_FAILED (karencja nie resetuje się)', async () => {
    const { s, prisma } = zbuduj({ saldoOk: false, subs: [pastDue] });
    await (s as unknown as { runRenewalWindow(): Promise<void> }).runRenewalWindow();
    expect(prisma.subscriptionEvent.create).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('pierwsza nieudana opłata ACTIVE nadal przechodzi w PAST_DUE', async () => {
    const { s, prisma } = zbuduj({ saldoOk: false, subs: [{ ...pastDue, status: 'ACTIVE' }] });
    await (s as unknown as { runRenewalWindow(): Promise<void> }).runRenewalWindow();
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'PAYMENT_FAILED' }) }),
    );
  });

  it('„Opłać z portfela”: brak środków → czytelny błąd; usługa kartą → odmowa', async () => {
    await expect(zbuduj({ saldoOk: false, subs: [pastDue] }).s.retryPastDueNow('u1', 's1')).rejects.toThrow('Za mało środków');
    await expect(
      zbuduj({ saldoOk: true, subs: [{ ...pastDue, paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_x' }] }).s.retryPastDueNow('u1', 's1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(zbuduj({ saldoOk: true, subs: [pastDue] }).s.retryPastDueNow('u1', 's1')).resolves.toEqual({ status: 'ACTIVE' });
  });
});

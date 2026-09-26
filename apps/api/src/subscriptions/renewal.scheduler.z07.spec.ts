import { BadRequestException, ConflictException } from '@nestjs/common';
import { RenewalScheduler } from './renewal.scheduler.js';

/** Z-07 — karencja przy płatności portfelem: doładowanie ratuje usługę przed zawieszeniem. */
function zbuduj(opts: { saldoOk: boolean; subs: Array<Record<string, unknown>>; bladBazy?: boolean }) {
  const prisma = {
    subscription: {
      findMany: vi.fn(async () => opts.subs),
      findFirst: vi.fn(async () => opts.subs[0] ?? null),
      update: vi.fn(async () => ({})),
    },
    subscriptionEvent: { create: vi.fn(async () => ({})) },
  };
  const walletLedger = {
    findByIdempotencyKey: vi.fn(async () => null),
    debit: vi.fn(async () => {
      if (opts.bladBazy) throw new Error("Can't reach database server");
      if (!opts.saldoOk) throw new ConflictException('Insufficient wallet balance for this charge');
    }),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const promo = { resolveNextRenewalAmount: vi.fn(async () => 45) };
  const eco = { safeAward: vi.fn(), awardSubscriptionRenewal: vi.fn() };
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

  it('błąd bazy przy obciążeniu to NIE brak środków: bez PAST_DUE i bez startu karencji', async () => {
    const { s, prisma } = zbuduj({ saldoOk: true, bladBazy: true, subs: [{ ...pastDue, status: 'ACTIVE' }] });
    await (s as unknown as { runRenewalWindow(): Promise<void> }).runRenewalWindow();
    expect(prisma.subscriptionEvent.create).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAST_DUE' } }));
  });
});

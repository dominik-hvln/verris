import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';

/** M-26 — klient usuwa zapisaną kartę. */
function setup(pm: Record<string, unknown> | null, detach: jest.Mock = jest.fn().mockResolvedValue({})) {
  const prisma = {
    paymentMethod: { findFirst: jest.fn().mockResolvedValue(pm), delete: jest.fn().mockReturnValue('del') },
    user: { updateMany: jest.fn().mockReturnValue('user') },
    walletAutoTopup: { updateMany: jest.fn().mockReturnValue('auto') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const audit = { record: jest.fn() };
  const stripe = { detachPaymentMethod: detach };
  const svc = new (BillingService as unknown as new (...a: unknown[]) => BillingService)(prisma, {}, stripe, audit, {}, {}, {}, {}, {}, {});
  return { svc, prisma, audit, stripe };
}

const card = { id: 'c1', userId: 'u1', provider: 'STRIPE', providerRef: 'pm_123', brand: 'visa', last4: '4242' };

describe('M-26 deleteMyPaymentMethod', () => {
  it('odpina w Stripe, usuwa wiersz, czyści kartę domyślną i auto-doładowanie', async () => {
    const { svc, prisma, audit, stripe } = setup(card);
    await expect(svc.deleteMyPaymentMethod('u1', 'c1')).resolves.toEqual({ ok: true });
    expect(prisma.paymentMethod.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', userId: 'u1' } });
    expect(stripe.detachPaymentMethod).toHaveBeenCalledWith('pm_123');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', defaultPaymentMethodId: 'pm_123' },
      data: { defaultPaymentMethodId: null },
    });
    expect(prisma.walletAutoTopup.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', paymentMethodId: 'c1' },
      data: { paymentMethodId: null },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['del', 'user', 'auto']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAYMENT_METHOD_REMOVED', userId: 'u1' }));
  });

  it('cudza albo nieistniejąca karta → 404, nic nie rusza', async () => {
    const { svc, stripe, prisma } = setup(null);
    await expect(svc.deleteMyPaymentMethod('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(stripe.detachPaymentMethod).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('karta już odpięta w Stripe → sprzątamy u siebie', async () => {
    const { svc, prisma } = setup(card, jest.fn().mockRejectedValue(new Error('No such PaymentMethod: pm_123')));
    await expect(svc.deleteMyPaymentMethod('u1', 'c1')).resolves.toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('awaria Stripe → błąd, wiersz zostaje (można ponowić)', async () => {
    const { svc, prisma } = setup(card, jest.fn().mockRejectedValue(new Error('Stripe request failed (500)')));
    await expect(svc.deleteMyPaymentMethod('u1', 'c1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

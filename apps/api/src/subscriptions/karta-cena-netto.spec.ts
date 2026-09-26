import { BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';

/** M-09 — klient rozliczany netto nie kupi usługi kartą (karta = cena brutto z cennika). */
describe('M-09 — karta a cena netto', () => {
  const plan = { id: 'p1', isActive: true, isPublic: true, productKind: 'HOSTING', priceMonthly: 45, priceYearly: 399 };
  const zbuduj = (cenaNetto: boolean) => {
    const prisma = { plan: { findUnique: vi.fn(async () => plan) }, user: { findUnique: vi.fn(async () => ({ billingOutside: false })) } };
    const vat = { ustal: vi.fn(async () => ({ traktowanie: { cenaNetto }, vies: null })) };
    const n = {} as never;
    return new SubscriptionsService(prisma as never, n, n, n, n, n, n, n, n, n, n, n, vat as never);
  };
  const dto = { planId: 'p1', interval: 'MONTH', paymentSource: 'STRIPE_CARD', domain: 'x.pl' } as never;

  it('odrzuca kartę dla klienta rozliczanego netto, z podpowiedzią portfela', async () => {
    await expect(zbuduj(true).create('u1', dto)).rejects.toThrow(BadRequestException);
    await expect(zbuduj(true).create('u1', dto)).rejects.toThrow(/portfela/);
  });

  it('klient z polskim VAT przechodzi dalej (tu: dalsze zależności są puste, więc inny błąd)', async () => {
    await expect(zbuduj(false).create('u1', dto)).rejects.not.toThrow(/portfela/);
  });
});

import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Smart retry Stripe po końcu karencji: płatność przychodzi, gdy usługa jest już zawieszona za brak
 * płatności. Wcześniej status SUSPENDED „przelatywał” — klient zapłacił, a usługa dalej stała.
 */
const odwieszone: string[] = [];
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const subs = new SubscriptionsService(
    p, audit, new WalletLedgerService(p), null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
  (subs as unknown as { unsuspendOnDa: (s: string, u: string) => Promise<void> }).unsuspendOnDa = async (_s, u) => void odwieszone.push(u);
  return subs;
}

async function zawieszona(powod: string) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: { status: 'SUSPENDED', stripeSubscriptionId: `sub_${k.subscription.id.slice(0, 8)}`, paymentSource: 'STRIPE_CARD' },
  });
  await prisma().account.update({ where: { id: k.account.id }, data: { status: 'SUSPENDED' } });
  await prisma().subscriptionEvent.create({ data: { subscriptionId: k.subscription.id, type: 'SUSPENDED', details: { reason: powod } } });
  return k;
}

describe('Stripe: płatność po zawieszeniu', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    odwieszone.length = 0;
  });
  afterAll(rozlacz);

  it('zawieszenie za brak płatności: po udanej płatności usługa wraca, okres przedłużony', async () => {
    const k = await zawieszona('GRACE_EXPIRED');
    const koniec = new Date(Date.now() + 30 * 864e5);
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId: `sub_${k.subscription.id.slice(0, 8)}`, periodEnd: koniec });
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } });
    expect(s.status).toBe('ACTIVE');
    expect(s.currentPeriodEnd?.getTime()).toBe(koniec.getTime());
    expect(odwieszone).toHaveLength(1);
  });

  it('zawieszenie za nadużycie: płatność nie odwiesza', async () => {
    const k = await zawieszona('ABUSE');
    await uslugi().activateAfterStripePayment({ stripeSubscriptionId: `sub_${k.subscription.id.slice(0, 8)}` });
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } });
    expect(s.status).toBe('SUSPENDED');
    expect(odwieszone).toHaveLength(0);
  });

  it.each(['GRACE_EXPIRED', 'ABUSE'])('kolejne nieudane ponowienie Stripe po zawieszeniu (%s): status i harmonogram bez zmian (CL-04 Z-01)', async (powod) => {
    const k = await zawieszona(powod);
    const przed = await prisma().subscriptionEvent.count({ where: { subscriptionId: k.subscription.id } });
    await uslugi().markPastDueFromStripe({ stripeSubscriptionId: `sub_${k.subscription.id.slice(0, 8)}`, reason: 'invoice.payment_failed' });
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } });
    expect(s.status).toBe('SUSPENDED');
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: k.subscription.id } })).toBe(przed);
  });
});


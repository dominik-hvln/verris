/**
 * PRZEGLĄD 12.10 — obietnica zapłaty nie była czyszczona po zapłacie i obowiązywała także NASTĘPNĄ zaległość.
 * Uruchom: DATABASE_URL=… npx vitest run -c vitest.integration.config.ts test/integration/obietnica-nowa-zaleglosc.int-spec.ts
 *
 * Przed poprawką CZERWONY: renewal.scheduler.ts runGraceExpiry sprawdza samo `paymentPromiseUntil > now`. Pole ustawia
 * cykl-zycia-uslugi.service.ts ustawObietniceZaplaty i nikt go nie zerował. Scenariusz: zaległość #1 → obietnica 7 dni
 * (L3) → klient płaci (ACTIVE) → nowa nieudana płatność (PAST_DUE) → harmonogram nie zawieszał do końca starej obietnicy,
 * a windykacja i karta usługi pokazywały „obietnica zapłaty do …”, choć nikt jej na tę zaległość nie dał.
 * Poprawka: przejście ACTIVE → PAST_DUE (nowa zaległość) zeruje paymentPromiseUntil — w harmonogramie portfela
 * (markPastDue) i z systemu płatności (markPastDueFromStripe).
 */
import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

const DZIEN = 86_400_000;
const zawieszone: string[] = [];
const subs = {
  finalizeScheduledCancellation: async () => null,
  suspend: async (o: { subscriptionId: string }) => {
    zawieszone.push(o.subscriptionId);
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.SUSPENDED } });
  },
  unsuspend: async () => undefined,
};
function scheduler() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
  return new RenewalScheduler(p, ledger, subs as never, audit, promo, { safeAward: () => undefined } as never);
}
function uslugi() {
  const p = prisma() as never;
  return new SubscriptionsService(
    p, new AuditService(p), new WalletLedgerService(p), null as never, null as never, null as never, null as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never,
    null as never, null as never,
  );
}
/** Obietnica z zaległości #1 (dana 3 dni temu na 7 dni) — zostaje w polu po zapłacie. */
const STARA_OBIETNICA = () => new Date(Date.now() + 4 * DZIEN);

describe('obietnica zapłaty a kolejna zaległość (przegląd 12.10)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zawieszone.length = 0;
  });
  afterAll(rozlacz);

  it('portfel: nowa zaległość w harmonogramie zeruje starą obietnicę i usługa jest zawieszana', async () => {
    const p = prisma();
    const k = await p.user.create({ data: { email: `obiet-w-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
    const plan = await utworzPlan();
    const u = await p.subscription.create({
      data: {
        userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
        paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 30 * DZIEN), currentPeriodEnd: new Date(Date.now() - 3600_000),
        paymentPromiseUntil: STARA_OBIETNICA(),
      } as never,
    });

    await scheduler().handleHourlyTick();
    const po = await p.subscription.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.paymentPromiseUntil).toBeNull();
    expect(zawieszone).toEqual([u.id]);
  });

  it('karta: nieudana płatność z systemu płatności zeruje starą obietnicę, harmonogram zawiesza', async () => {
    const p = prisma();
    const k = await p.user.create({ data: { email: `obiet-k-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
    const plan = await utworzPlan();
    const teraz = Date.now();
    const u = await p.subscription.create({
      data: {
        userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
        paymentSource: 'STRIPE_CARD', stripeSubscriptionId: `sub_test_${teraz}`,
        currentPeriodStart: new Date(teraz - 3 * DZIEN), currentPeriodEnd: new Date(teraz + 27 * DZIEN),
        paymentPromiseUntil: STARA_OBIETNICA(),
      } as never,
    });

    await uslugi().markPastDueFromStripe({ stripeSubscriptionId: `sub_test_${teraz}`, reason: 'card_declined' });
    const po = await p.subscription.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(po.paymentPromiseUntil).toBeNull();
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([u.id]);
  });

  it('obietnica dana w tej zaległości dalej wstrzymuje zawieszenie', async () => {
    const p = prisma();
    const k = await p.user.create({ data: { email: `obiet-t-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
    const plan = await utworzPlan();
    const u = await p.subscription.create({
      data: {
        userId: k.id, planId: plan.id, status: SubscriptionStatus.PAST_DUE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
        paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 31 * DZIEN), currentPeriodEnd: new Date(Date.now() - DZIEN),
        paymentPromiseUntil: new Date(Date.now() + 2 * DZIEN),
      } as never,
    });
    await p.subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'PAYMENT_FAILED', createdAt: new Date(Date.now() - DZIEN), details: {} } as never });
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([]);
    expect((await p.subscription.findUniqueOrThrow({ where: { id: u.id } })).paymentPromiseUntil).not.toBeNull();
  });
});

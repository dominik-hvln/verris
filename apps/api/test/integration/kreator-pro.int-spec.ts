import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { wersjaKreatora } from '../../src/kreator/wersja-kreatora.js';
import { PLAN_KREATOR_PRO } from '../../src/plans/plan-kreator-pro.js';
import { prisma, rozlacz, ustawModelFakturowania, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 121 — abonament Verris Kreator Pro na prawdziwej bazie, tym samym torem co e-mail marketing:
 * zakup z portfela (aktywacja od razu, faktura „abonament miesięczny” z VAT 23%), odmowa bez płatnego hostingu,
 * jeden abonament na konto (także przy równoległych zamówieniach), odnowienie z portfela, karencja → zawieszenie
 * → wersja „hosting”, anulowanie odnowienia, płatność kartą (aktywacja i odnowienie z webhooka Stripe).
 * Atrapy: Stripe, poczta, kolejka zakładania kont (produkt jej nie używa).
 */

const stripe = {
  createCustomer: async () => ({ id: 'cus_k121' }),
  createSubscriptionCheckoutSession: async () => ({ id: `cs_${Math.random().toString(36).slice(2)}`, url: 'https://checkout.stripe.test/k121' }),
  cancelSubscription: async () => ({}),
};

function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const kolejka = { isAsync: () => true, enqueueWalletProvision: async () => { throw new Error('Kreator Pro nie zakłada konta'); } };
  const subs = new SubscriptionsService(
    p, audit, ledger, stripe as never, { sprawdzMiejsce: async () => { throw new Error('bez węzła'); } } as never, kolejka as never, null as never,
    mailer as never, { get: () => undefined } as never, promo,
    { safeAward: () => undefined, awardSubscriptionFirstPaid: async () => undefined } as never,
    { getTrialOffer: async () => ({ cardEnabled: false, monthlyAutoscalingCredit: 0, annualAutoscalingCredit: 0 }) } as never,
    { ustal: async () => ({ traktowanie: { cenaNetto: false }, vies: null }) } as never,
  );
  const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
  const odnowienia = new RenewalScheduler(p, ledger, subs, audit, promo, eco as never);
  return { subs, odnowienia };
}

let n = 0;
async function klient(saldo: number, hosting: 'platny' | 'proba' | 'brak' = 'platny') {
  n += 1;
  const u = await prisma().user.create({ data: { email: `k121-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
  if (hosting !== 'brak') {
    const plan = await utworzPlan();
    await prisma().subscription.create({
      data: {
        userId: u.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE', paymentSource: 'WALLET',
        isTrial: hosting === 'proba', currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      },
    });
  }
  return u;
}

const planPro = () =>
  utworzPlan({
    productKind: 'KREATOR_PRO', slug: PLAN_KREATOR_PRO.slug, name: PLAN_KREATOR_PRO.name,
    priceMonthly: Number(PLAN_KREATOR_PRO.priceMonthly), priceYearly: Number(PLAN_KREATOR_PRO.priceYearly),
    cpuLimit: 1, ramLimitMb: 1, diskLimitMb: 1, stripePriceMonthlyId: 'price_k121_m', stripePriceYearlyId: 'price_k121_y',
  });
const zamowienie = (planId: string, extra: Record<string, unknown> = {}) =>
  ({ planId, interval: 'MONTH', paymentSource: 'WALLET', immediatePerformanceConsent: true, ...extra }) as never;
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const sub = (id: string) => prisma().subscription.findUniqueOrThrow({ where: { id } });
const wersja = (userId: string) => wersjaKreatora(prisma() as never, userId);

describe('Paczka 121 – abonament Kreator Pro (baza)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    // Faktura przy obciążeniu portfela (Z-01) – dokument z pozycją abonamentu powstaje razem z obciążeniem.
    await ustawModelFakturowania('przy_obciazeniu');
  });
  afterAll(rozlacz);

  it('zakup z portfela: jedno obciążenie 9,90 zł, aktywny od razu bez konta, faktura „abonament miesięczny” z VAT 23%, wersja pro', async () => {
    const k = await klient(50);
    const plan = await planPro();
    expect(await wersja(k.id)).toBe('hosting');
    const { subscription } = await uslugi().subs.create(k.id, zamowienie(plan.id));
    expect(await saldo(k.id)).toBeCloseTo(40.1, 2);
    const s = await sub(subscription.id);
    expect(s.status).toBe(SubscriptionStatus.ACTIVE);
    expect(s.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    expect(await prisma().account.count()).toBe(0);
    const faktury = await prisma().invoice.findMany({ where: { userId: k.id } });
    expect(faktury).toHaveLength(1);
    const f = faktury[0];
    expect([f.amount.toFixed(2), f.netAmount?.toFixed(2), f.vatAmount?.toFixed(2), Number(f.vatRate)]).toEqual(['9.90', '8.05', '1.85', 23]);
    const pozycje = f.lineItems as Array<{ name: string; vatRate: number }>;
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0].name).toMatch(/^Verris Kreator Pro – abonament miesięczny, okres \d{2}\.\d{2}\.\d{4}–\d{2}\.\d{2}\.\d{4}$/);
    expect(pozycje[0].vatRate).toBe(23);
    expect(f.subscriptionId).toBe(subscription.id);
    expect(await wersja(k.id)).toBe('pro');
  });

  it('bez płatnego hostingu: odmowa 403 przed obciążeniem (w próbie – „po opłaceniu hostingu”), bez zamówienia', async () => {
    const plan = await planPro();
    const wProbie = await klient(50, 'proba');
    const blad = await uslugi().subs.create(wProbie.id, zamowienie(plan.id)).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as Error).message).toContain('po opłaceniu hostingu');
    const bezHostingu = await klient(50, 'brak');
    await expect(uslugi().subs.create(bezHostingu.id, zamowienie(plan.id))).rejects.toBeInstanceOf(ForbiddenException);
    for (const k of [wProbie, bezHostingu]) {
      expect(await saldo(k.id)).toBe(50);
      expect(await prisma().subscription.count({ where: { userId: k.id, planId: plan.id } })).toBe(0);
    }
  });

  it('jeden abonament na konto: drugi zakup → 409; dwa równoległe zamówienia → jedno obciążenie', async () => {
    const plan = await planPro();
    const k = await klient(100);
    await uslugi().subs.create(k.id, zamowienie(plan.id));
    await expect(uslugi().subs.create(k.id, zamowienie(plan.id, { interval: 'YEAR' }))).rejects.toBeInstanceOf(ConflictException);
    expect(await saldo(k.id)).toBeCloseTo(90.1, 2);

    const r = await klient(100);
    const wyniki = await Promise.allSettled([uslugi().subs.create(r.id, zamowienie(plan.id)), uslugi().subs.create(r.id, zamowienie(plan.id))]);
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect((wyniki.find((w) => w.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(await prisma().subscription.count({ where: { userId: r.id, planId: plan.id } })).toBe(1);
    expect(await saldo(r.id)).toBeCloseTo(90.1, 2);
  });

  it('odnowienie z portfela: obciążenie 9,90 zł z pozycją „abonament miesięczny” od końca okresu, okres przesunięty', async () => {
    const plan = await planPro();
    const k = await klient(30);
    const { subscription } = await uslugi().subs.create(k.id, zamowienie(plan.id));
    const koniec = new Date(Date.now() + 6 * 3600000);
    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: koniec } });
    await uslugi().odnowienia.handleHourlyTick();
    expect(await saldo(k.id)).toBeCloseTo(10.2, 2);
    const po = await sub(subscription.id);
    expect(po.status).toBe(SubscriptionStatus.ACTIVE);
    expect(po.currentPeriodStart!.toISOString()).toBe(koniec.toISOString());
    const odnowienie = await prisma().walletTransaction.findFirstOrThrow({
      where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION, idempotencyKey: { contains: '-renew-' } },
      include: { invoice: true },
    });
    expect(odnowienie.description).toMatch(/^Verris Kreator Pro – abonament miesięczny, okres /);
    expect((odnowienie.invoice!.lineItems as Array<{ name: string }>)[0].name).toBe(odnowienie.description);
    expect(odnowienie.invoice!.vatAmount?.toFixed(2)).toBe('1.85');
  });

  it('brak środków: karencja (nadal pro) → zawieszenie z końcem okresu (wersja hosting) → wygaśnięcie; nowy zakup znów możliwy', async () => {
    const plan = await planPro();
    const k = await klient(10);
    const { subscription } = await uslugi().subs.create(k.id, zamowienie(plan.id));
    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: new Date(Date.now() + 3600000) } });
    const { odnowienia } = uslugi();
    await odnowienia.handleHourlyTick();
    expect((await sub(subscription.id)).status).toBe(SubscriptionStatus.PAST_DUE);
    expect(await wersja(k.id)).toBe('pro');

    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: new Date(Date.now() - 60000) } });
    await odnowienia.handleHourlyTick();
    expect((await sub(subscription.id)).status).toBe(SubscriptionStatus.SUSPENDED);
    expect(await wersja(k.id)).toBe('hosting');

    await prisma().subscriptionEvent.updateMany({ where: { subscriptionId: subscription.id, type: 'SUSPENDED' }, data: { createdAt: new Date(Date.now() - 15 * 86400000) } });
    await odnowienia.runSuspensionExpiry();
    expect((await sub(subscription.id)).status).toBe(SubscriptionStatus.EXPIRED);
    expect(await wersja(k.id)).toBe('hosting');

    await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 20 } });
    const nowy = await uslugi().subs.create(k.id, zamowienie(plan.id));
    expect(nowy.subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(await wersja(k.id)).toBe('pro');
  });

  it('anulowanie odnowienia: działa do końca okresu bez obciążenia, potem koniec Pro (wersja hosting)', async () => {
    const plan = await planPro();
    const k = await klient(30);
    const { subs, odnowienia } = uslugi();
    const { subscription } = await subs.create(k.id, zamowienie(plan.id));
    const koniec = new Date(Date.now() + 6 * 3600000);
    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: koniec } });
    const anulowana = await subs.cancel(k.id, subscription.id, { atPeriodEnd: true });
    expect(anulowana.status).toBe(SubscriptionStatus.ACTIVE);
    expect(anulowana.cancelAt?.toISOString()).toBe(koniec.toISOString());
    await odnowienia.handleHourlyTick();
    expect(await saldo(k.id)).toBeCloseTo(20.1, 2);
    expect(await wersja(k.id)).toBe('pro');

    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: new Date(Date.now() - 60000), cancelAt: new Date(Date.now() - 60000) } });
    await odnowienia.handleHourlyTick();
    expect((await sub(subscription.id)).status).toBe(SubscriptionStatus.CANCELED);
    expect(await saldo(k.id)).toBeCloseTo(20.1, 2);
    expect(await wersja(k.id)).toBe('hosting');
  });

  it('karta: zamówienie czeka na Stripe (bez obciążenia portfela), invoice.paid aktywuje bez konta, kolejne invoice.paid odnawia', async () => {
    const plan = await planPro();
    const k = await klient(0);
    const { subs } = uslugi();
    const wynik = await subs.create(k.id, zamowienie(plan.id, { paymentSource: 'STRIPE_CARD', interval: 'YEAR' }));
    expect(wynik.checkoutRedirectUrl).toBe('https://checkout.stripe.test/k121');
    expect(wynik.subscription.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
    expect(await wersja(k.id)).toBe('hosting');
    // Zamówienie czekające na płatność blokuje drugie (opłacone później dałoby dwa abonamenty).
    await expect(subs.create(k.id, zamowienie(plan.id))).rejects.toBeInstanceOf(ConflictException);

    const start = new Date();
    const rok = new Date(start.getTime() + 365 * 86400000);
    await subs.powiazSubskrypcjeZCheckout({ verrisSubscriptionId: wynik.subscription.id, stripeSubscriptionId: 'sub_k121', sessionId: 'cs_x' });
    await subs.activateAfterStripePayment({ stripeSubscriptionId: 'sub_k121', periodStart: start, periodEnd: rok, stripeInvoiceId: 'in_1' });
    let s = await sub(wynik.subscription.id);
    expect(s.status).toBe(SubscriptionStatus.ACTIVE);
    expect(s.currentPeriodEnd!.toISOString()).toBe(rok.toISOString());
    expect(await prisma().account.count()).toBe(0);
    expect(await wersja(k.id)).toBe('pro');

    const dwaLata = new Date(rok.getTime() + 365 * 86400000);
    await subs.activateAfterStripePayment({ stripeSubscriptionId: 'sub_k121', periodStart: rok, periodEnd: dwaLata, stripeInvoiceId: 'in_2' });
    s = await sub(wynik.subscription.id);
    expect(s.currentPeriodEnd!.toISOString()).toBe(dwaLata.toISOString());
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: s.id, type: 'RENEWED' } })).toBe(1);
    expect(await saldo(k.id)).toBe(0);
  });
});

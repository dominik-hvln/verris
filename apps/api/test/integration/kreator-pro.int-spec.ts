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
  cancelSubscription: vi.fn(async (_id: string, _o: { atPeriodEnd?: boolean }) => ({})),
  retrieveSubscription: vi.fn(async () => ({ items: { data: [{ id: 'si_k123' }] } })),
  updateSubscriptionPrice: vi.fn(async (_i: { subscriptionId: string; subscriptionItemId: string; newPriceId: string; prorationBehavior?: string }) => ({
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
    items: { data: [{ id: 'si_k123', current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400 }] },
  })),
};
const maile: Array<{ subject: string; to: string; text?: string }> = [];

function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async (m: { subject: string; to: string; text?: string }) => void maile.push(m) };
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

  // ---------------------------------------------------------------------------
  // Paczka 123
  // ---------------------------------------------------------------------------

  const hostingKlienta = (userId: string) =>
    prisma().subscription.findFirstOrThrow({ where: { userId, plan: { productKind: 'HOSTING' } } });

  it('paczka 123 – hosting anulowany: odnowienie Pro wyłączone (do końca okresu, bez zwrotu i bez obciążenia), mail, powód w stanie', async () => {
    const plan = await planPro();
    const k = await klient(30);
    const { subs, odnowienia } = uslugi();
    const { subscription } = await subs.create(k.id, zamowienie(plan.id));
    const koniec = new Date(Date.now() + 6 * 3600000);
    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: koniec } });
    // Hosting działa – przebieg nic nie zmienia.
    expect(await odnowienia.runKreatorProBezHostingu()).toBe(0);
    await prisma().subscription.update({ where: { id: (await hostingKlienta(k.id)).id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    maile.length = 0;
    await odnowienia.handleHourlyTick();
    const po = await sub(subscription.id);
    expect(po.status).toBe(SubscriptionStatus.ACTIVE);
    expect(po.cancelAt?.toISOString()).toBe(koniec.toISOString());
    // Okno odnowień w tym samym przebiegu nie pobrało opłaty (Pro zostaje opłacony do końca okresu, bez zwrotu).
    expect(await saldo(k.id)).toBeCloseTo(20.1, 2);
    const zdarzenie = await prisma().subscriptionEvent.findFirstOrThrow({ where: { subscriptionId: subscription.id, type: 'CANCEL_SCHEDULED' } });
    expect(zdarzenie.details).toMatchObject({ actor: null, source: 'SYSTEM', reason: 'KREATOR_PRO_BEZ_HOSTINGU' });
    await vi.waitFor(() => expect(maile.map((m) => m.subject)).toContain('[Verris] Kreator Pro nie odnowi się – brak hostingu'));
    const { stanKreatoraPro } = await import('../../src/kreator/kreator-pro.js');
    expect((await stanKreatoraPro(prisma() as never, k.id)).abonament).toMatchObject({ bezOdnowienia: true, powodBezOdnowienia: 'brak-hostingu' });
    // Drugi przebieg – nic nowego (bez drugiego maila).
    maile.length = 0;
    expect(await odnowienia.runKreatorProBezHostingu()).toBe(0);
    expect(maile).toHaveLength(0);
  });

  it('paczka 123 – hosting zawieszony nie wyłącza odnowienia; karta: rezygnacja na koniec okresu także w Stripe', async () => {
    const plan = await planPro();
    const k = await klient(0);
    const { subs, odnowienia } = uslugi();
    const wynik = await subs.create(k.id, zamowienie(plan.id, { paymentSource: 'STRIPE_CARD' }));
    await subs.powiazSubskrypcjeZCheckout({ verrisSubscriptionId: wynik.subscription.id, stripeSubscriptionId: 'sub_k123_bez', sessionId: 'cs_y' });
    const koniec = new Date(Date.now() + 20 * 86400000);
    await subs.activateAfterStripePayment({ stripeSubscriptionId: 'sub_k123_bez', periodStart: new Date(), periodEnd: koniec, stripeInvoiceId: 'in_k123' });
    const hosting = await hostingKlienta(k.id);
    await prisma().subscription.update({ where: { id: hosting.id }, data: { status: 'SUSPENDED' } });
    expect(await odnowienia.runKreatorProBezHostingu()).toBe(0);
    await prisma().subscription.update({ where: { id: hosting.id }, data: { status: 'EXPIRED' } });
    stripe.cancelSubscription.mockClear();
    expect(await odnowienia.runKreatorProBezHostingu()).toBe(1);
    expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_k123_bez', { atPeriodEnd: true });
    expect((await sub(wynik.subscription.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());
  });

  it('paczka 123 – zmiana na rok od następnego odnowienia (portfel): obciążenie 99 zł, faktura „abonament roczny”, okres +1 rok', async () => {
    const plan = await planPro();
    const k = await klient(120);
    const { subs, odnowienia } = uslugi();
    const { subscription } = await subs.create(k.id, zamowienie(plan.id));
    const { zaplanujOkresPro, stanKreatoraPro } = await import('../../src/kreator/kreator-pro.js');
    expect(await zaplanujOkresPro(prisma() as never, k.id, 'YEAR')).toEqual({ nastepnyOkres: 'YEAR' });
    expect((await stanKreatoraPro(prisma() as never, k.id)).abonament).toMatchObject({ interval: 'MONTH', nastepnyOkres: 'YEAR' });
    const koniec = new Date(Date.now() + 6 * 3600000);
    await prisma().subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: koniec } });
    await odnowienia.handleHourlyTick();
    expect(await saldo(k.id)).toBeCloseTo(120 - 9.9 - 99, 2);
    const po = await sub(subscription.id);
    expect([po.interval, po.nastepnyInterwal, po.priceAmount.toFixed(2), po.listPriceAmount?.toFixed(2)]).toEqual(['YEAR', null, '99.00', '99.00']);
    const rok = new Date(koniec);
    rok.setUTCFullYear(rok.getUTCFullYear() + 1);
    expect(po.currentPeriodEnd?.toISOString()).toBe(rok.toISOString());
    const odnowienie = await prisma().walletTransaction.findFirstOrThrow({
      where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION, idempotencyKey: { contains: '-renew-' } },
      include: { invoice: true },
    });
    expect(odnowienie.description).toMatch(/^Verris Kreator Pro – abonament roczny, okres /);
    expect(odnowienie.invoice!.amount.toFixed(2)).toBe('99.00');
    expect((odnowienie.invoice!.lineItems as Array<{ name: string }>)[0].name).toBe(odnowienie.description);
    expect(odnowienie.invoice!.netAmount?.toFixed(2)).toBe('80.49');
    // Rok → miesiąc wraca do 9,90 zł przy kolejnym odnowieniu; ten sam okres = rezygnacja z planu zmiany.
    expect(await zaplanujOkresPro(prisma() as never, k.id, 'MONTH')).toEqual({ nastepnyOkres: 'MONTH' });
    expect(await zaplanujOkresPro(prisma() as never, k.id, 'YEAR')).toEqual({ nastepnyOkres: null });
    expect((await sub(subscription.id)).nastepnyInterwal).toBeNull();
  });

  it('paczka 123 – zmiana okresu kartą: cena Stripe zmieniana tuż przed końcem okresu (bez proraty), lokalnie nowy okres i cena', async () => {
    const plan = await planPro();
    const k = await klient(0);
    const { subs, odnowienia } = uslugi();
    const wynik = await subs.create(k.id, zamowienie(plan.id, { paymentSource: 'STRIPE_CARD' }));
    await subs.powiazSubskrypcjeZCheckout({ verrisSubscriptionId: wynik.subscription.id, stripeSubscriptionId: 'sub_k123_okres', sessionId: 'cs_z' });
    const daleko = new Date(Date.now() + 10 * 86400000);
    await subs.activateAfterStripePayment({ stripeSubscriptionId: 'sub_k123_okres', periodStart: new Date(), periodEnd: daleko, stripeInvoiceId: 'in_k123_o' });
    const { zaplanujOkresPro } = await import('../../src/kreator/kreator-pro.js');
    await zaplanujOkresPro(prisma() as never, k.id, 'YEAR');
    stripe.updateSubscriptionPrice.mockClear();
    // Daleko od końca okresu – nic.
    expect(await odnowienia.runZmianyOkresuKarta()).toBe(0);
    await prisma().subscription.update({ where: { id: wynik.subscription.id }, data: { currentPeriodEnd: new Date(Date.now() + 90 * 60000) } });
    expect(await odnowienia.runZmianyOkresuKarta()).toBe(1);
    expect(stripe.updateSubscriptionPrice).toHaveBeenCalledWith({
      subscriptionId: 'sub_k123_okres', subscriptionItemId: 'si_k123', newPriceId: 'price_k121_y', prorationBehavior: 'none',
    });
    const po = await sub(wynik.subscription.id);
    expect([po.interval, po.nastepnyInterwal, po.priceAmount.toFixed(2)]).toEqual(['YEAR', null, '99.00']);
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 360 * 86400000);
    // Drugi przebieg – zmiana już zastosowana.
    expect(await odnowienia.runZmianyOkresuKarta()).toBe(0);
  });
});

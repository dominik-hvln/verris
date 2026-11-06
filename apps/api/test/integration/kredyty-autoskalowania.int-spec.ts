import { ConflictException } from '@nestjs/common';
import { AutoscalingResource, Prisma, SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { ProvisioningService } from '../../src/subscriptions/provisioning.service.js';
import { NodeSelectorService } from '../../src/subscriptions/node-selector.service.js';
import { DirectAdminService } from '../../src/servers/directadmin.service.js';
import { AutoscalingBillingService } from '../../src/autoscaling/autoscaling-billing.service.js';
import { AutoscalingBillingScheduler } from '../../src/autoscaling/autoscaling-billing.scheduler.js';
import { obciazAutoskalowanie, pulaKredytow } from '../../src/autoscaling/kredyty-autoskalowania.js';
import { saldoDoZwrotu } from '../../src/users/zwrot-salda.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Decyzja Dominika 6.11.2026 — „rabat na start” zastąpiony kredytami na autoskalowanie przy pierwszym zakupie hostingu
 * (60 zł przy planie rocznym, 10 zł przy miesięcznym). Na prawdziwej bazie: zamówienie zapisuje kwotę, przyznanie
 * dopiero przy założeniu opłaconego konta, jedna pula na klienta, autoskalowanie zjada najpierw pulę (potem portfel),
 * po wygaśnięciu już nie, planu ani domeny z puli nie opłacisz, a zwrot salda puli nie widzi.
 */

const OFERTA = { freeEnabled: true, cardEnabled: true, annualAutoscalingCredit: 60, monthlyAutoscalingCredit: 10, autoscalingCreditValidityMonths: 12 };
const kolejka: string[] = [];

function zamowienia() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = { isAsync: () => true, enqueueWalletProvision: async (o: { subscriptionId: string }) => void kolejka.push(o.subscriptionId) };
  const provisioning = { sprawdzDomeneGlowna: async () => undefined, sprawdzMiejsce: async () => undefined };
  return new SubscriptionsService(
    p, audit, ledger, null as never, provisioning as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => OFERTA } as never, null as never,
  );
}

function zakladanie() {
  const p = prisma() as never;
  const klient = {
    ensureUserPackage: async () => undefined,
    createAccount: async () => ({ password: 'Haslo-123' }),
    setAccountLimits: async () => undefined,
    deleteAccount: async () => undefined,
  };
  const noop = { send: async () => ({}), get: () => undefined, safeAward: () => undefined, awardOnce: async () => undefined, setModeForAccount: async () => undefined };
  return new ProvisioningService(
    p, { encrypt: (v: string) => `enc:${v}` } as never, new AuditService(p), new NodeSelectorService(p),
    {
      getClientForServer: async () => klient, requestLetsEncryptDirect: async () => undefined, usunDelegacjeUsunietegoKonta: async () => undefined,
      assertDomenaNieJestCudza: (d: string, u: string, o?: { glowna?: boolean }) => DirectAdminService.prototype.assertDomenaNieJestCudza.call({ prisma: p }, d, u, o),
    } as never, { resolveNameservers: async () => ({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' }) } as never,
    noop as never, noop as never, noop as never, noop as never,
  );
}

let n = 0;
const klient = (saldo: number) => {
  n += 1;
  return prisma().user.create({ data: { email: `kredyty-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const pula = async (userId: string) => prisma().kredytAutoskalowania.findUnique({ where: { userId } });
const zamowienie = (planId: string, interval: 'MONTH' | 'YEAR', domain: string) =>
  ({ planId, interval, paymentSource: 'WALLET', domain, immediatePerformanceConsent: true }) as never;

/** Klient z pulą przyznaną wprost (do testów rozliczenia). */
async function zPula(saldoPortfela: number, kwota: number, wygasaAt = new Date(Date.now() + 365 * 86_400_000)) {
  const k = await klient(saldoPortfela);
  await prisma().kredytAutoskalowania.create({
    data: { userId: k.id, subscriptionId: 'zamowienie-testowe', kwota, pozostalo: kwota, wygasaAt },
  });
  return k;
}
const ledger = () => new WalletLedgerService(prisma() as never);
const obciaz = (userId: string, kwota: number, klucz: string, teraz?: Date) =>
  obciazAutoskalowanie(prisma() as never, ledger(), {
    userId, type: WalletTxType.CHARGE_AUTOSCALING, amount: kwota, idempotencyKey: klucz,
    metadata: { kind: 'autoscaling_block', revenueCpuPln: kwota.toFixed(2), revenueRamPln: '0.00', revenueDiskPln: '0.00' },
  }, teraz);

describe('kredyty na autoskalowanie zamiast rabatu na start (decyzja 6.11.2026)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
  });
  afterAll(rozlacz);

  it('pierwszy zakup hostingu (rok): cena z cennika, kwota zapisana na zamówieniu, pula dopiero po założeniu konta – 60 zł na 12 miesięcy', async () => {
    await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING', priceMonthly: 45, priceYearly: 449 });
    const k = await klient(500);
    const usl = zamowienia();
    expect(await usl.kredytyStartowe(k.id)).toEqual({ przysluguje: true });

    const { subscription } = await usl.create(k.id, zamowienie(plan.id, 'YEAR', 'pierwszy-sklep.pl'));
    // Bez rabatu: pierwszy okres = cena odnowienia.
    expect(await saldo(k.id)).toBe(51);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(Number(s.priceAmount)).toBe(449);
    expect(s.introDiscountPct).toBe(0);
    expect(Number(s.kredytAutoskalowaniaKwota)).toBe(60);
    // Opłacone, ale konto jeszcze nie ruszyło → kredytów jeszcze nie ma.
    expect(await pula(k.id)).toBeNull();
    expect(await usl.kredytyStartowe(k.id)).toEqual({ przysluguje: false });

    const przed = Date.now();
    await zakladanie().provisionForSubscription(subscription.id, { domain: 'pierwszy-sklep.pl' });
    const p = await pula(k.id);
    expect(Number(p?.kwota)).toBe(60);
    expect(Number(p?.pozostalo)).toBe(60);
    expect(p?.subscriptionId).toBe(subscription.id);
    const oczekiwane = new Date(przed);
    oczekiwane.setUTCMonth(oczekiwane.getUTCMonth() + 12);
    expect(Math.abs(p!.wygasaAt.getTime() - oczekiwane.getTime())).toBeLessThan(60_000);
    // Kredyty są poza portfelem: saldo bez zmian, żadnego wpisu w księdze (bez faktury).
    expect(await saldo(k.id)).toBe(51);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: { not: WalletTxType.CHARGE_SUBSCRIPTION } } })).toBe(0);
  });

  it('pierwszy zakup miesięczny: 10 zł; kolejny zakup hostingu – bez kredytów i bez drugiej puli', async () => {
    await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING', priceMonthly: 45, priceYearly: 449 });
    const k = await klient(600);
    const usl = zamowienia();
    const pierwsza = await usl.create(k.id, zamowienie(plan.id, 'MONTH', 'miesieczny.pl'));
    expect(await saldo(k.id)).toBe(555);
    await zakladanie().provisionForSubscription(pierwsza.subscription.id, { domain: 'miesieczny.pl' });
    expect(Number((await pula(k.id))?.kwota)).toBe(10);

    const druga = await usl.create(k.id, zamowienie(plan.id, 'YEAR', 'drugi.pl'));
    const s2 = await prisma().subscription.findUniqueOrThrow({ where: { id: druga.subscription.id } });
    expect(s2.kredytAutoskalowaniaKwota).toBeNull();
    await zakladanie().provisionForSubscription(druga.subscription.id, { domain: 'drugi.pl' });
    expect(await prisma().kredytAutoskalowania.count({ where: { userId: k.id } })).toBe(1);
    expect(Number((await pula(k.id))?.kwota)).toBe(10);
  });

  it('zamówienie z portfela bez środków nie trzyma promocji: po doładowaniu nowe zamówienie dostaje kredyty', async () => {
    const plan = await utworzPlan({ productKind: 'HOSTING', priceMonthly: 45, priceYearly: 449 });
    const k = await klient(0);
    const usl = zamowienia();
    await expect(usl.create(k.id, zamowienie(plan.id, 'YEAR', 'brak-srodkow.pl'))).rejects.toThrow('Za mało środków');
    const wiszace = await prisma().subscription.findFirstOrThrow({ where: { userId: k.id } });
    expect(wiszace.kredytAutoskalowaniaKwota).toBeNull();
    expect(await usl.kredytyStartowe(k.id)).toEqual({ przysluguje: true });
  });

  it('poczta (nie hosting) i karta: bez kredytów na autoskalowanie', async () => {
    const poczta = await utworzPlan({ productKind: 'EMAIL', priceMonthly: 9.99, priceYearly: 99.99 });
    const k = await klient(100);
    const { subscription } = await zamowienia().create(k.id, zamowienie(poczta.id, 'YEAR', 'poczta-firmy.pl'));
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } })).kredytAutoskalowaniaKwota).toBeNull();
  });

  it('autoskalowanie zjada najpierw pulę, potem portfel; pula nie trafia do księgi; powtórka klucza nic nie zmienia', async () => {
    const k = await zPula(5, 3);
    const r1 = await obciaz(k.id, 2, 'blok-1');
    expect(r1.walletTx).toBeNull();
    expect(r1.zPuli.toFixed(2)).toBe('2.00');
    expect(Number((await pula(k.id))?.pozostalo)).toBe(1);
    expect(await saldo(k.id)).toBe(5);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);

    // Blok 2,50: 1,00 z puli, 1,50 z portfela; przychód z zasobów tylko z części z portfela.
    const r2 = await obciaz(k.id, 2.5, 'blok-2');
    expect(r2.zPuli.toFixed(2)).toBe('1.00');
    expect(Number(r2.walletTx?.amount)).toBe(-1.5);
    expect(r2.walletTx?.metadata).toMatchObject({ zKredytowAutoskalowania: '1.00', kosztBloku: '2.50', revenueCpuPln: '1.50' });
    expect(Number((await pula(k.id))?.pozostalo)).toBe(0);
    expect(await saldo(k.id)).toBe(3.5);

    await obciaz(k.id, 2.5, 'blok-2');
    await obciaz(k.id, 2, 'blok-1');
    expect(await saldo(k.id)).toBe(3.5);
    expect(await prisma().kredytAutoskalowaniaUzycie.count()).toBe(2);
  });

  it('po wygaśnięciu pula nie płaci (całość z portfela), a panel widzi ją jako wygasłą z saldem 0', async () => {
    const wygasa = new Date(Date.now() + 60_000);
    const k = await zPula(10, 60, wygasa);
    const poWygasnieciu = new Date(wygasa.getTime() + 1000);
    const r = await obciaz(k.id, 4, 'blok-po', poWygasnieciu);
    expect(r.zPuli.toFixed(2)).toBe('0.00');
    expect(Number(r.walletTx?.amount)).toBe(-4);
    expect(await saldo(k.id)).toBe(6);
    expect(Number((await pula(k.id))?.pozostalo)).toBe(60);
    const widok = await pulaKredytow(prisma() as never, k.id, poWygasnieciu);
    expect(widok).toMatchObject({ wygasla: true });
    expect(widok?.saldo.toFixed(2)).toBe('0.00');
  });

  it('brak środków na resztę: nic nie schodzi ani z puli, ani z portfela (blok czeka na doładowanie)', async () => {
    const k = await zPula(0.5, 1);
    await expect(obciaz(k.id, 3, 'blok-za-drogi')).rejects.toBeInstanceOf(ConflictException);
    expect(Number((await pula(k.id))?.pozostalo)).toBe(1);
    expect(await saldo(k.id)).toBe(0.5);
    expect(await prisma().kredytAutoskalowaniaUzycie.count()).toBe(0);
  });

  it('planu ani domeny z puli nie opłacisz: zamówienie hostingu i obciążenie za domenę przy pustym portfelu – odmowa', async () => {
    const plan = await utworzPlan({ productKind: 'HOSTING', priceMonthly: 45, priceYearly: 449 });
    const k = await zPula(0, 60);
    await expect(zamowienia().create(k.id, zamowienie(plan.id, 'MONTH', 'bez-pieniedzy.pl'))).rejects.toThrow('Za mało środków');
    await expect(
      ledger().debit({ userId: k.id, type: WalletTxType.CHARGE_DOMAIN, amount: 50, description: 'Rejestracja domeny' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(Number((await pula(k.id))?.pozostalo)).toBe(60);
  });

  it('zwrot salda przy usunięciu konta nie liczy puli: zwracamy tylko opłacone saldo portfela', async () => {
    const k = await zPula(0, 60);
    await ledger().credit({ userId: k.id, type: WalletTxType.TOPUP, amount: 20, description: 'Doładowanie', idempotencyKey: `t-${k.id}` });
    await obciaz(k.id, 5, 'blok-z-puli');
    const u = await prisma().user.findUniqueOrThrow({ where: { id: k.id } });
    const tx = await prisma().walletTransaction.findMany({ where: { userId: k.id } });
    expect(saldoDoZwrotu(u.walletBalance, tx).toFixed(2)).toBe('20.00');
    expect(Number((await pula(k.id))?.pozostalo)).toBe(55);
  });

  it('rozliczenie bloków (cron): pierwsze bloki z puli, po jej wyczerpaniu z portfela; pusty portfel z pulą nie wstrzymuje', async () => {
    await prisma().autoscalingPriceRule.deleteMany({});
    await prisma().autoscalingPriceRule.create({ data: { resource: AutoscalingResource.CPU, unit: 'cpu_pct', pricePerUnit: 0.04 } });
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledCpu: 100 }); // 1 zł za blok
    await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 1 } });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: SubscriptionStatus.ACTIVE } });
    await prisma().kredytAutoskalowania.create({
      data: { userId: k.user.id, subscriptionId: k.subscription.id, kwota: 2, pozostalo: 2, wygasaAt: new Date(Date.now() + 86_400_000) },
    });
    const T0 = new Date(Date.now() - 60 * 60_000);
    await prisma().account.update({ where: { id: k.account.id }, data: { scaledSince: T0, scaledBilledUntil: T0 } });
    const p = prisma() as never;
    const billing = new AutoscalingBillingService(p, new WalletLedgerService(p));
    const r = await new AutoscalingBillingScheduler(p, billing).chargeDueBlocks(new Date(T0.getTime() + 40 * 60_000)); // 3 bloki
    expect(r.depleted).toBe(0);
    expect(Number((await pula(k.user.id))?.pozostalo)).toBe(0);
    expect(await saldo(k.user.id)).toBe(0);
    expect(await prisma().walletTransaction.count({ where: { userId: k.user.id, type: WalletTxType.CHARGE_AUTOSCALING } })).toBe(1);
    expect(await prisma().kredytAutoskalowaniaUzycie.count({ where: { subscriptionId: k.subscription.id } })).toBe(2);
    const zdarzenia = await prisma().autoscalingEvent.findMany({ where: { subscriptionId: k.subscription.id } });
    expect(zdarzenia.filter((e) => /kredyt=1\.00/.test(e.reason ?? ''))).toHaveLength(2);
    // Historia dla klienta: bloki z kredytów obok obciążeń portfela, plus saldo puli.
    const historia = await zamowienia().getAutoscalingHistory(k.user.id, k.subscription.id);
    expect(historia.charges.filter((c) => c.zKredytow)).toHaveLength(2);
    expect(historia.kredytyAutoskalowania).toMatchObject({ saldo: '0.00', kwota: '2.00', wygasla: false });
    expect(new Prisma.Decimal(historia.last30dSpend).toFixed(2)).toBe('1.00');
  });
});

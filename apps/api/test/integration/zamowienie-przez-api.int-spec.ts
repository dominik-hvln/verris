import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { ProvisioningService } from '../../src/subscriptions/provisioning.service.js';
import { DirectAdminService } from '../../src/servers/directadmin.service.js';
import { PublicApiOrdersController } from '../../src/subscriptions/public-api-orders.controller.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * L-08 część 2 (noc 15.10) — zamówienie przez publiczne API na prawdziwej bazie: obciążenie portfela dokładnie raz,
 * brak środków = nic nie zeszło, druga usługa na tę samą domenę odrzucona przed opłatą, ślad z tokenem w dzienniku.
 */
const kolejka: string[] = [];
function kontroler() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = { isAsync: () => true, enqueueWalletProvision: async (o: { subscriptionId: string }) => void kolejka.push(o.subscriptionId) };
  const provisioning = {
    sprawdzDomeneGlowna: (d: string, u: string) =>
      ProvisioningService.prototype.sprawdzDomeneGlowna.call(
        { prisma: p, da: { assertDomenaNieJestCudza: (x: string, y: string, o?: { glowna?: boolean }) => DirectAdminService.prototype.assertDomenaNieJestCudza.call({ prisma: p }, x, y, o) } },
        d, u,
      ),
    sprawdzMiejsce: async () => undefined,
  };
  const subs = new SubscriptionsService(
    p, audit, ledger, null as never, provisioning as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => ({ cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 }) } as never, null as never,
  );
  return new PublicApiOrdersController(subs, { checkReConsent: async () => ({ required: false }) } as never, audit, p);
}

let n = 0;
const klient = (saldo: number) => {
  n += 1;
  return prisma().user.create({ data: { email: `api-zam-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const req = (userId: string) => ({ apiAuth: { userId, tokenId: 'tok-1', scopes: ['orders:write'] } }) as never;
const body = (planId: string, domain = 'api-sklep.pl') => ({ planId, interval: 'MONTH', domain, immediatePerformanceConsent: true }) as never;

describe('L-08 — zamówienie przez API (portfel)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
    process.env.API_ZAMOWIENIA = '1';
  });
  afterAll(async () => {
    delete process.env.API_ZAMOWIENIA;
    await rozlacz();
  });

  it('środki są: jedno obciążenie, usługa w zakładaniu, wpis API_ORDER_CREATED z tokenem', async () => {
    const k = await klient(100);
    const plan = await utworzPlan({ priceMonthly: 45 });
    const w = await kontroler().zamow(req(k.id), body(plan.id));
    expect(await saldo(k.id)).toBe(55);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: w.id } })).status).toBe(SubscriptionStatus.PROVISIONING);
    expect(kolejka).toEqual([w.id]);
    const wpis = await prisma().auditLog.findFirst({ where: { action: 'API_ORDER_CREATED', userId: k.id } });
    expect(wpis?.details).toMatchObject({ subscriptionId: w.id, tokenId: 'tok-1', domain: 'api-sklep.pl' });
  });

  it('brak środków: błąd, saldo bez zmian, bez obciążenia', async () => {
    const k = await klient(10);
    const plan = await utworzPlan({ priceMonthly: 45 });
    await expect(kontroler().zamow(req(k.id), body(plan.id))).rejects.toThrow();
    expect(await saldo(k.id)).toBe(10);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(0);
    expect(kolejka).toEqual([]);
  });

  it('powtórzone zamówienie tej samej domeny (np. ponowienie skryptu): drugie odrzucone przed opłatą', async () => {
    const k = await klient(200);
    const plan = await utworzPlan({ priceMonthly: 45 });
    const c = kontroler();
    await c.zamow(req(k.id), body(plan.id, 'raz.pl'));
    // konto hostingowe powstaje w provisioningu (kolejka) — tu jak po założeniu
    const sub = await prisma().subscription.findFirstOrThrow({ where: { userId: k.id } });
    const wezel = await utworzWezel();
    await prisma().account.create({ data: { subscriptionId: sub.id, userId: k.id, serverId: wezel.id, domain: 'raz.pl', daUsername: `raz${n}x`, status: 'ACTIVE' } });
    await expect(c.zamow(req(k.id), body(plan.id, 'raz.pl'))).rejects.toThrow();
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
  });

  it('ponowienie skryptu zaraz po zamówieniu (konto jeszcze w kolejce) i dwa równoległe: jedno obciążenie, 409', async () => {
    const k = await klient(500);
    const plan = await utworzPlan({ priceMonthly: 45 });
    const c = kontroler();
    const wyniki = await Promise.allSettled([c.zamow(req(k.id), body(plan.id, 'dwa.pl')), c.zamow(req(k.id), body(plan.id, 'dwa.pl'))]);
    expect(wyniki.map((w) => w.status).sort()).toEqual(['fulfilled', 'rejected']);
    await expect(c.zamow(req(k.id), body(plan.id, 'dwa.pl'))).rejects.toThrow(/już zamówiona/);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
    expect(await saldo(k.id)).toBe(455);
  });
});

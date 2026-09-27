import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PlanChangeService } from '../../src/subscriptions/plan-change.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — zmiana planu z portfela na prawdziwej bazie (A-22). Sedno: dopłata/zwrot proporcjonalnie
 * do niewykorzystanej części okresu, księga węzła przesunięta dokładnie raz, a zmiana okresu
 * rozliczeniowego (miesiąc ↔ rok) nie daje nowego okresu za darmo.
 */

const DZIEN = 86_400_000;
const limityDA: { user: string; cpu: number }[] = [];
let daPada = false;

function usluga() {
  const p = prisma() as never;
  const da = {
    getClientForServer: async () => ({
      setAccountLimits: async (user: string, l: { cpuPercent: number }) => {
        if (daPada) throw new Error('DirectAdmin niedostępny');
        limityDA.push({ user, cpu: l.cpuPercent });
      },
    }),
  };
  return new PlanChangeService(
    p, new AuditService(p), new WalletLedgerService(p), null as never, da as never,
    { send: async () => ({}) } as never, { get: () => undefined } as never,
  );
}

/** Aktywna usługa z portfela, w połowie 30-dniowego okresu. */
async function usluga45(saldo: number, dniMinelo = 15, dniOkresu = 30) {
  const wezel = await utworzWezel();
  const maly = await utworzPlan({ priceMonthly: 45, priceYearly: 399, cpuLimit: 200 });
  const duzy = await utworzPlan({ priceMonthly: 90, priceYearly: 799, cpuLimit: 400, ramLimitMb: 16 * 1024 });
  const k = await utworzKonto({ serverId: wezel.id, planId: maly.id });
  await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: saldo } });
  const start = new Date(Date.now() - dniMinelo * DZIEN);
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      paymentSource: 'WALLET',
      currentPeriodStart: start,
      currentPeriodEnd: new Date(start.getTime() + dniOkresu * DZIEN),
    },
  });
  return { wezel, maly, duzy, ...k };
}

const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const wpisy = (userId: string) => prisma().walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const cpuWezla = async (id: string) => (await prisma().server.findUniqueOrThrow({ where: { id } })).allocatedCpu;

describe('X-04 zmiana planu z portfela', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    limityDA.length = 0;
    daPada = false;
  });
  afterAll(rozlacz);

  it('upgrade w połowie okresu: dopłata za resztę okresu, plan i księga węzła przesunięte', async () => {
    const u = await usluga45(500);
    const cpuPrzed = await cpuWezla(u.wezel.id);

    const r = await usluga().changeForUser(u.user.id, u.subscription.id, u.duzy.id);

    expect(r.direction).toBe('upgrade');
    expect(Number(r.amountDue)).toBeCloseTo(22.5, 0); // (90 − 45) × ½
    expect(await saldo(u.user.id)).toBeCloseTo(500 - Number(r.amountDue), 2);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } });
    expect(s.planId).toBe(u.duzy.id);
    expect(await cpuWezla(u.wezel.id)).toBe(cpuPrzed + 200);
    expect(limityDA).toEqual([{ user: u.account.daUsername, cpu: 400 }]);
  });

  it('downgrade: zwrot za niewykorzystaną różnicę na portfel', async () => {
    const u = await usluga45(0);
    await usluga().changeForUser(u.user.id, u.subscription.id, u.duzy.id).catch(() => undefined); // brak środków — bez zmian
    await prisma().subscription.update({ where: { id: u.subscription.id }, data: { planId: u.duzy.id, priceAmount: 90 } });

    const r = await usluga().changeForUser(u.user.id, u.subscription.id, u.maly.id);

    expect(r.direction).toBe('downgrade');
    expect(Number(r.amountCredit)).toBeCloseTo(22.5, 0);
    expect(await saldo(u.user.id)).toBeCloseTo(Number(r.amountCredit), 2);
  });

  it('brak środków na dopłatę: odmowa, portfel, plan i DirectAdmin nietknięte', async () => {
    const u = await usluga45(5);
    await expect(usluga().changeForUser(u.user.id, u.subscription.id, u.duzy.id)).rejects.toThrow('Niewystarczające saldo');
    expect(await saldo(u.user.id)).toBe(5);
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } })).planId).toBe(u.maly.id);
    expect(limityDA).toEqual([]);
  });

  it('DirectAdmin pada: dopłata wraca na portfel, plan bez zmian', async () => {
    const u = await usluga45(500);
    daPada = true;
    await expect(usluga().changeForUser(u.user.id, u.subscription.id, u.duzy.id)).rejects.toThrow('DirectAdmin');
    expect(await saldo(u.user.id)).toBe(500);
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } })).planId).toBe(u.maly.id);
  });

  it('podwójne kliknięcie upgrade: jedna dopłata i księga węzła przesunięta raz', async () => {
    const u = await usluga45(500);
    const cpuPrzed = await cpuWezla(u.wezel.id);
    const svc = usluga();

    const wyniki = await Promise.allSettled([
      svc.changeForUser(u.user.id, u.subscription.id, u.duzy.id),
      svc.changeForUser(u.user.id, u.subscription.id, u.duzy.id),
    ]);

    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const netto = (await wpisy(u.user.id)).reduce((a, t) => a + Number(t.amount), 0);
    expect(netto).toBeCloseTo(-22.5, 0);
    expect(await cpuWezla(u.wezel.id)).toBe(cpuPrzed + 200);
  });

  it('dwie różne zmiany naraz: wygrywa jedna, przegrana nic nie kosztuje, DirectAdmin zgodny z bazą', async () => {
    const u = await usluga45(500);
    const sredni = await utworzPlan({ priceMonthly: 60, priceYearly: 549, cpuLimit: 300 });
    const svc = usluga();

    const wyniki = await Promise.allSettled([
      svc.changeForUser(u.user.id, u.subscription.id, u.duzy.id),
      svc.changeForUser(u.user.id, u.subscription.id, sredni.id),
    ]);

    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id }, include: { plan: true } });
    const zaplacone = -(await wpisy(u.user.id)).reduce((a, t) => a + Number(t.amount), 0);
    expect(zaplacone).toBeCloseTo((Number(s.plan.priceMonthly) - 45) / 2, 0);
    expect(limityDA.at(-1)?.cpu).toBe(s.plan.cpuLimit);
  });

  it('miesiąc → rok: nowy roczny okres kosztuje cenę roczną minus niewykorzystana część miesiąca', async () => {
    const u = await usluga45(500);

    const r = await usluga().changeForUser(u.user.id, u.subscription.id, u.maly.id, 'YEAR');

    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } });
    expect(s.interval).toBe('YEAR');
    expect(s.currentPeriodEnd!.getTime() - Date.now()).toBeGreaterThan(360 * DZIEN);
    expect(r.direction).toBe('upgrade');
    expect(Number(r.amountDue)).toBeCloseTo(399 - 22.5, 0);
    expect(await saldo(u.user.id)).toBeCloseTo(500 - (399 - 22.5), 0);
    expect((await wpisy(u.user.id)).filter((t) => t.type === WalletTxType.CHARGE_PLAN_UPGRADE)).toHaveLength(1);
  });

  it('rok → miesiąc po miesiącu: zwrot niewykorzystanego roku minus nowy miesiąc', async () => {
    const u = await usluga45(0, 30, 365);
    await prisma().subscription.update({ where: { id: u.subscription.id }, data: { interval: 'YEAR', priceAmount: 399 } });

    const r = await usluga().changeForUser(u.user.id, u.subscription.id, u.maly.id, 'MONTH');

    expect(r.direction).toBe('downgrade');
    expect(Number(r.amountCredit)).toBeCloseTo(399 * (335 / 365) - 45, 0);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: u.subscription.id } });
    expect(s.interval).toBe('MONTH');
    expect(s.currentPeriodEnd!.getTime() - Date.now()).toBeLessThan(32 * DZIEN);
  });
});

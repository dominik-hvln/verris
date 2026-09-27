import { AutoscalingResource, WalletTxType } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AutoscalingBillingService } from '../../src/autoscaling/autoscaling-billing.service.js';
import { AutoscalingBillingScheduler } from '../../src/autoscaling/autoscaling-billing.scheduler.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — rozliczanie autoskalowania blokami 15 min na prawdziwej bazie: pierwszy blok od razu,
 * kolejne co 15 min, dwa nakładające się przebiegi (silnik po skalowaniu + cron co 5 min),
 * pusty portfel w połowie zaległości, rabat operatora i rozliczenie poza Verris (MANUAL).
 * Cena: 0,04 zł za 1% CPU na godzinę → +100% CPU = 4 zł/h = 1 zł za blok.
 */
const T0 = new Date('2026-09-27T10:00:00Z');
const min = (m: number) => new Date(T0.getTime() + m * 60_000);

function uslugi() {
  const p = prisma() as never;
  const billing = new AutoscalingBillingService(p, new WalletLedgerService(p));
  return { billing, cron: new AutoscalingBillingScheduler(p, billing) };
}

async function przygotuj(saldo: number, sub: Record<string, unknown> = {}) {
  await prisma().autoscalingPriceRule.create({
    data: { resource: AutoscalingResource.CPU, unit: 'cpu_pct', pricePerUnit: 0.04 },
  });
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledCpu: 100 });
  await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: saldo } });
  await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE', ...sub } });
  // Skalowanie w górę o T0 — tak zapisuje je silnik.
  await prisma().account.update({ where: { id: k.account.id }, data: { scaledSince: T0, scaledBilledUntil: T0 } });
  return k;
}

const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const obciazenia = (userId: string) =>
  prisma().walletTransaction.count({ where: { userId, type: WalletTxType.CHARGE_AUTOSCALING } });
const zdarzenia = (subscriptionId: string) => prisma().autoscalingEvent.count({ where: { subscriptionId } });

describe('X-04 rozliczanie autoskalowania', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('pierwszy blok od razu, ten sam blok drugi raz nie, kolejny po 15 min', async () => {
    const k = await przygotuj(50);
    const { cron } = uslugi();
    await cron.chargeDueBlocks(min(1));
    expect(await saldo(k.user.id)).toBe(49);
    await cron.chargeDueBlocks(min(6));
    expect(await saldo(k.user.id)).toBe(49);
    await cron.chargeDueBlocks(min(16));
    expect(await saldo(k.user.id)).toBe(48);
    expect(await obciazenia(k.user.id)).toBe(2);
  });

  it('dwa nakładające się przebiegi nad zaległymi blokami: każdy blok raz w portfelu i raz w historii', async () => {
    const k = await przygotuj(50);
    const { cron } = uslugi();
    await Promise.all([cron.chargeDueBlocks(min(40)), cron.chargeDueBlocks(min(40))]);
    expect(await saldo(k.user.id)).toBe(47);
    expect(await obciazenia(k.user.id)).toBe(3);
    expect(await zdarzenia(k.subscription.id)).toBe(3);
  });

  it('portfel kończy się w połowie zaległości: tyle bloków, na ile starczy; po doładowaniu reszta bez podwójnych', async () => {
    const k = await przygotuj(2);
    const { cron } = uslugi();
    const r = await cron.chargeDueBlocks(min(55)); // 4 bloki zaległe, starczy na 2
    expect(r.depleted).toBe(1);
    expect(await saldo(k.user.id)).toBe(0);
    await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 10 } });
    await cron.chargeDueBlocks(min(56));
    expect(await obciazenia(k.user.id)).toBe(4);
    expect(await saldo(k.user.id)).toBe(8);
    expect(await zdarzenia(k.subscription.id)).toBe(4);
  });

  it('rabat operatora 50%: blok za 0,50 zł', async () => {
    const k = await przygotuj(10, { autoscalingDiscountPct: 50 });
    await uslugi().cron.chargeDueBlocks(min(1));
    expect(await saldo(k.user.id)).toBe(9.5);
  });

  it('rozliczenie poza Verris: bez obciążenia portfela, każdy blok raz w zestawieniu — także przy dwóch przebiegach', async () => {
    const k = await przygotuj(10, { paymentSource: 'MANUAL' });
    const { cron } = uslugi();
    await Promise.all([cron.chargeDueBlocks(min(40)), cron.chargeDueBlocks(min(40))]);
    expect(await saldo(k.user.id)).toBe(10);
    expect(await zdarzenia(k.subscription.id)).toBe(3);
  });
});

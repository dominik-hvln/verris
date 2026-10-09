import { AutoscalingResource, WalletTxType } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AutoscalingBillingService } from '../../src/autoscaling/autoscaling-billing.service.js';
import { AutoscalingBillingScheduler } from '../../src/autoscaling/autoscaling-billing.scheduler.js';
import { WarunkiIndywidualneService } from '../../src/subscriptions/warunki-indywidualne.service.js';
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
  await prisma().autoscalingPriceRule.deleteMany({}); // cennik nie jest czyszczony między testami
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

  it('reszta groszy: blok 0,0165 zł (cennik produkcyjny, +50% CPU) — suma pobrań zgodna z cennikiem, nie +21%', async () => {
    // Na żywo 09.10 (d3): 0,001323 zł za 1% CPU/h × 50% × 0,25 h = 0,0165375 zł, a portfel tracił 0,02 zł na blok.
    await prisma().autoscalingPriceRule.deleteMany({}); // cennik nie jest czyszczony między testami
    await prisma().autoscalingPriceRule.create({
      data: { resource: AutoscalingResource.CPU, unit: 'cpu_pct', pricePerUnit: 0.001323 },
    });
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledCpu: 50 });
    await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 10 } });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    await prisma().account.update({ where: { id: k.account.id }, data: { scaledSince: T0, scaledBilledUntil: T0 } });
    const { cron } = uslugi();
    for (const m of [1, 16, 31, 46, 61, 76, 91, 106]) await cron.chargeDueBlocks(min(m));
    // 8 bloków × 0,0165375 = 0,1323 zł → 0,13 zł (stare zaokrąglanie bloków osobno: 8 × 0,02 = 0,16 zł).
    expect(await saldo(k.user.id)).toBeCloseTo(10 - 0.13, 2);
    const reszta = Number((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).scaledCostCarryPln);
    expect(Math.abs(reszta)).toBeLessThanOrEqual(0.005);
  });

  it('blok tańszy niż pół grosza nie przepada — zlicza się w kolejnych blokach', async () => {
    await prisma().autoscalingPriceRule.deleteMany({}); // cennik nie jest czyszczony między testami
    await prisma().autoscalingPriceRule.create({
      data: { resource: AutoscalingResource.CPU, unit: 'cpu_pct', pricePerUnit: 0.0001 },
    });
    const wezel = await utworzWezel();
    const plan = await utworzPlan({ productKind: 'HOSTING' });
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, scaledCpu: 50 });
    await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 10 } });
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    await prisma().account.update({ where: { id: k.account.id }, data: { scaledSince: T0, scaledBilledUntil: T0 } });
    const { cron } = uslugi();
    // 0,0001 × 50 × 0,25 = 0,00125 zł na blok; po 4 blokach 0,005 zł → pierwszy grosz.
    for (const m of [1, 16, 31, 46]) await cron.chargeDueBlocks(min(m));
    expect(await saldo(k.user.id)).toBeCloseTo(9.99, 2);
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

  // Decyzja 09.10 (test na żywo: blok 16:14 opłacony przy +50% CPU, do 16:29 konto miało do +200%, różnica przepadała).
  describe('dopłata za podbicie w trakcie opłaconego bloku', () => {
    type K = Awaited<ReturnType<typeof przygotuj>>;
    /** Silnik: zapisuje nowy poziom i od razu rozlicza (applyChange → billDueBlocks). */
    async function podbij(k: K, cpu: number, m: number) {
      await prisma().account.update({ where: { id: k.account.id }, data: { scaledCpu: cpu } });
      return rozlicz(k, m);
    }
    async function rozlicz(k: K, m: number, poziom?: number) {
      const a = await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } });
      const reguly = await prisma().autoscalingPriceRule.findMany({ where: { isActive: true } });
      return uslugi().billing.billDueBlocks(
        {
          id: a.id, subscriptionId: k.subscription.id, userId: k.user.id, domain: a.domain,
          scaledCpu: poziom ?? a.scaledCpu, scaledRamMb: a.scaledRamMb, scaledDiskMb: a.scaledDiskMb,
          scaledSince: a.scaledSince, scaledBilledUntil: a.scaledBilledUntil,
        },
        reguly,
        min(m),
      );
    }
    const opisy = async (userId: string) =>
      (await prisma().walletTransaction.findMany({
        where: { userId, type: WalletTxType.CHARGE_AUTOSCALING }, orderBy: { createdAt: 'asc' },
      })).map((t) => t.description);

    it('podbicie w połowie bloku: dopłata różnicy za połowę bloku, z opisem po polsku', async () => {
      const k = await przygotuj(50); // +100% = 1 zł za blok
      await uslugi().cron.chargeDueBlocks(min(0));
      expect(await saldo(k.user.id)).toBe(49);
      await podbij(k, 200, 7.5); // +200% = 2 zł za blok → (2 − 1) × 7,5/15
      expect(await saldo(k.user.id)).toBe(48.5);
      await uslugi().cron.chargeDueBlocks(min(10));
      expect(await saldo(k.user.id)).toBe(48.5);
      await uslugi().cron.chargeDueBlocks(min(15)); // następny blok już przy +200%
      expect(await saldo(k.user.id)).toBe(46.5);
      expect(await opisy(k.user.id)).toContain('Autoskalowanie — dopłata za podbicie w bloku (cpu+100%→+200%, 7,5 min)');
      // Historia klienta: zdarzenie księgowe ze znanym prefiksem, który oś czasu panelu odfiltrowuje.
      const ev = await prisma().autoscalingEvent.findMany({ where: { subscriptionId: k.subscription.id } });
      expect(ev).toHaveLength(3);
      for (const e of ev) expect(e.reason).toMatch(/^block_charge /);
    });

    it('rabat operatora i reszta groszy obowiązują także dopłatę', async () => {
      const k = await przygotuj(50, { autoscalingDiscountPct: 50 }); // blok +100% = 0,50 zł
      await uslugi().cron.chargeDueBlocks(min(0));
      await podbij(k, 200, 10); // (1,00 − 0,50) × 5/15 = 0,1666… → 0,17, reszta −0,0033
      expect(await saldo(k.user.id)).toBeCloseTo(50 - 0.5 - 0.17, 2);
      const a = await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } });
      expect(Number(a.scaledCostCarryPln)).toBeCloseTo(0.1666667 - 0.17, 5);
    });

    it('dwa nakładające się przebiegi (silnik + cron): dopłata raz w portfelu i raz w historii', async () => {
      const k = await przygotuj(50);
      await uslugi().cron.chargeDueBlocks(min(1));
      await prisma().account.update({ where: { id: k.account.id }, data: { scaledCpu: 200 } });
      await Promise.all([rozlicz(k, 5), uslugi().cron.chargeDueBlocks(min(5)), rozlicz(k, 5)]);
      expect(await saldo(k.user.id)).toBeCloseTo(49 - 0.67, 2); // 1 zł × 10/15
      expect(await obciazenia(k.user.id)).toBe(2);
      expect(await zdarzenia(k.subscription.id)).toBe(2);
    });

    it('podbicie i nowy blok w tej samej minucie: bez podwójnego liczenia (w obu kolejnościach)', async () => {
      // Silnik pierwszy: nowy blok od razu przy +200%, za stary blok nic nie dopłacamy.
      const a = await przygotuj(50);
      await uslugi().cron.chargeDueBlocks(min(1));
      await podbij(a, 200, 15);
      await uslugi().cron.chargeDueBlocks(min(15));
      await uslugi().cron.chargeDueBlocks(min(20));
      expect(await saldo(a.user.id)).toBe(47);
      expect(await obciazenia(a.user.id)).toBe(2);
      // Cron pierwszy, jeszcze ze starym poziomem (+100%): blok 1 zł, potem silnik dopłaca 1 zł za pełne 15 min.
      const b = await przygotuj(50);
      await uslugi().cron.chargeDueBlocks(min(1));
      await prisma().account.update({ where: { id: b.account.id }, data: { scaledCpu: 200 } });
      await rozlicz(b, 15, 100);
      await rozlicz(b, 15);
      await uslugi().cron.chargeDueBlocks(min(20));
      expect(await saldo(b.user.id)).toBe(47);
    });

    it('spadek w trakcie bloku: bez zwrotu, a powrót do opłaconego poziomu bez dopłaty', async () => {
      const k = await przygotuj(50);
      await uslugi().cron.chargeDueBlocks(min(1));
      await podbij(k, 50, 5);
      expect(await saldo(k.user.id)).toBe(49);
      await podbij(k, 100, 8);
      expect(await saldo(k.user.id)).toBe(49);
      await podbij(k, 200, 12); // ponad opłacone +100%: (2 − 1) × 3/15 = 0,20
      expect(await saldo(k.user.id)).toBe(48.8);
      expect(await obciazenia(k.user.id)).toBe(2);
    });

    it('zmiana cennika albo rabatu w trakcie bloku bez podbicia poziomu: brak dopłaty, nowa cena od następnego bloku', async () => {
      // Podwyżka cennika: +100% CPU z 1 zł na 2 zł za blok w połowie opłaconego bloku.
      const a = await przygotuj(50);
      await uslugi().cron.chargeDueBlocks(min(0));
      await prisma().autoscalingPriceRule.updateMany({ data: { pricePerUnit: 0.08 } });
      await uslugi().cron.chargeDueBlocks(min(5));
      expect(await saldo(a.user.id)).toBe(49);
      expect(await obciazenia(a.user.id)).toBe(1);
      await uslugi().cron.chargeDueBlocks(min(15));
      expect(await saldo(a.user.id)).toBe(47);
      // Operator zdejmuje rabat 50% w trakcie bloku.
      await prisma().autoscalingPriceRule.updateMany({ data: { pricePerUnit: 0.04 } });
      const b = await przygotuj(50, { autoscalingDiscountPct: 50 });
      await uslugi().cron.chargeDueBlocks(min(0));
      expect(await saldo(b.user.id)).toBe(49.5);
      await prisma().subscription.update({ where: { id: b.subscription.id }, data: { autoscalingDiscountPct: 0 } });
      await uslugi().cron.chargeDueBlocks(min(5));
      expect(await saldo(b.user.id)).toBe(49.5);
      expect(await obciazenia(b.user.id)).toBe(1);
    });

    it('pusty portfel: dopłata nie jest oznaczona jako opłacona; po doładowaniu w tym samym bloku pobrana raz', async () => {
      const k = await przygotuj(1);
      await uslugi().cron.chargeDueBlocks(min(0));
      expect(await saldo(k.user.id)).toBe(0);
      const r = await podbij(k, 200, 5);
      expect(r.walletDepleted).toBe(true);
      expect(await obciazenia(k.user.id)).toBe(1);
      await prisma().user.update({ where: { id: k.user.id }, data: { walletBalance: 10 } });
      await rozlicz(k, 6); // (2 − 1) × 9/15 = 0,60
      await rozlicz(k, 7);
      expect(await saldo(k.user.id)).toBe(9.4);
      expect(await obciazenia(k.user.id)).toBe(2);
    });

    it('rozliczenie poza Verris: dopłata trafia do zestawienia (raz), portfel nietknięty', async () => {
      const k = await przygotuj(10, { paymentSource: 'MANUAL' });
      await uslugi().cron.chargeDueBlocks(min(0));
      await prisma().account.update({ where: { id: k.account.id }, data: { scaledCpu: 200 } });
      await Promise.all([rozlicz(k, 7.5), rozlicz(k, 7.5)]);
      expect(await saldo(k.user.id)).toBe(10);
      expect(await zdarzenia(k.subscription.id)).toBe(2);
      const podglad = await new WarunkiIndywidualneService(prisma() as never, null as never, null as never).podglad(k.user.id);
      expect(podglad.autoskalowaniePoza).toEqual([
        expect.objectContaining({ subscriptionId: k.subscription.id, bloki: 1, doplaty: 1, kwota: '1.50' }),
      ]);
    });
  });
});

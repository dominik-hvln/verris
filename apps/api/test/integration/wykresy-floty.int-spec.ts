import { WykresyFlotyService } from '../../src/servers/wykresy-floty.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Flota — wykresy na prawdziwym Postgresie: próbki co minutę z dwóch kont jednego węzła
 * sumują się w każdej minucie, a punkt godzinowy to średnia tych sum (date_bin w SQL).
 */
const GODZ = 3_600_000;

describe('Flota — wykresy (SQL)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('seria godzinowa = średnia z sum kont w minucie, % rdzeni i RAM węzła', async () => {
    const w = await utworzWezel({ name: 'fsn-01', totalCpuCores: 4, totalMemoryMb: 8192 });
    const plan = await utworzPlan();
    const a = await utworzKonto({ serverId: w.id, planId: plan.id });
    const b = await utworzKonto({ serverId: w.id, planId: plan.id });
    const teraz = Date.now();
    const h1 = Math.floor(teraz / GODZ) * GODZ - 3 * GODZ;
    const h2 = h1 + GODZ;
    const probka = (k: typeof a, t: number, cpu: number, ram: number) => ({
      subscriptionId: k.subscription.id,
      accountId: k.account.id,
      serverId: w.id,
      bucketStart: new Date(t),
      bucketDurationS: 60,
      cpuUsageAvg: cpu,
      memUsageAvgMb: ram,
      diskUsageMb: 100,
    });
    const dane = [];
    for (let m = 0; m < 60; m++) {
      // h1: oba konta co minutę (100 + 60 = 160% rdzenia, 1024 + 512 MB)
      dane.push(probka(a, h1 + m * 60_000, 100, 1024), probka(b, h1 + m * 60_000, 60, 512));
      // h2: konto B tylko w pierwszej połowie godziny — średnia sum = (30·300 + 30·200) / 60 = 250
      dane.push(probka(a, h2 + m * 60_000, 200, 2048));
      if (m < 30) dane.push(probka(b, h2 + m * 60_000, 100, 0));
    }
    // próbka 300 s spoza okna 24 h nie wpada do serii
    dane.push({ ...probka(a, teraz - 30 * GODZ, 999, 999), bucketDurationS: 300 });
    await prisma().usageMetric.createMany({ data: dane });

    const r = await new WykresyFlotyService(prisma() as never).wykresy('24h', 'stan', teraz);
    const wz = r.wezly.find((x) => x.id === w.id)!;
    expect(wz.cpu).toEqual([
      { t: new Date(h1).toISOString(), v: 40 },
      { t: new Date(h2).toISOString(), v: 62.5 },
    ]);
    expect(wz.ram).toEqual([
      { t: new Date(h1).toISOString(), v: 18.8 },
      { t: new Date(h2).toISOString(), v: 25 },
    ]);
    expect(wz).toMatchObject({ name: 'fsn-01', accounts: 2, stan: 'norma', cpuNow: null });
    expect(r.kpi).toMatchObject({ aktywne: 1, wszystkie: 1, cpuSrednie: 51 });
  });
});

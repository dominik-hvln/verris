import { AiService } from '../../src/ai/ai.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * t1 05.10: telemetria co 60 s, a prognoza brała 96 ostatnich próbek (~1,5 h) — „pewność niska”
 * zawsze i trend z półtorej godziny rzutowany na 7 dni. Teraz średnie godzinowe z 7 dni (SQL).
 */
describe('Prognoza zasobów — godzinowe średnie z 7 dni', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('próbki co minutę przez 4 dni → ~96 punktów godzinowych, pewność wysoka, dysk rośnie', async () => {
    const wezel = await utworzWezel({ identityToken: 'tok-prog' });
    const plan = await utworzPlan();
    const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
    const teraz = Date.now();
    const dane = [];
    for (let m = 4 * 24 * 60; m > 0; m -= 5) {
      const godz = (4 * 24 * 60 - m) / 60;
      dane.push({
        subscriptionId: k.subscription.id, accountId: k.account.id, serverId: wezel.id,
        bucketStart: new Date(teraz - m * 60_000), bucketDurationS: 60,
        cpuUsageAvg: 10, memUsageAvgMb: 100, diskUsageMb: 100 + godz, ioUsageKbps: 1,
      });
    }
    await prisma().usageMetric.createMany({ data: dane });
    const provider = { dostepny: async () => false };
    const r = await new AiService(prisma() as never, provider as never, { record: async () => undefined } as never)
      .serviceForecast(k.subscription.id, k.user.id, k.user.id);
    expect(r.available).toBe(true);
    expect(r.confidence).toBe('high');
    expect(r.resources.find((x) => x.resource === 'DISK')?.trend).not.toBe('down');
  });
});

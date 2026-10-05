import { AiService } from '../../src/ai/ai.service.js';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { StosWezlaService } from '../../src/servers/stos-wezla.service.js';
import { PrognozaWezlaService } from '../../src/servers/prognoza-wezla.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Prognoza węzła na prawdziwej bazie: suma próbek kont na węźle → średnie godzinowe z 7 dni
 * (wspólne SQL z wykresami floty), najcichsza godzina w czasie polskim, kandydaci po domenie,
 * komentarz AI z cache po `inputSummary.serverId` (filtr JSON w Postgresie).
 */
const godzinaPl = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Warsaw' });

describe('Prognoza węzła — dane z UsageMetric', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('dwa konta, próbki co minutę przez 3 doby → CPU/RAM, okno 03:00, kandydaci, cache AI per węzeł', async () => {
    const w = await utworzWezel({ name: 'fsn-01', totalCpuCores: 4, totalMemoryMb: 8192, totalDiskMb: 200_000, lastOffsiteBackupAt: new Date(), lastOffsiteBackupOk: true });
    const inny = await utworzWezel({ name: 'fsn-02' });
    const plan = await utworzPlan();
    const a = await utworzKonto({ serverId: w.id, planId: plan.id });
    const b = await utworzKonto({ serverId: w.id, planId: plan.id });
    const teraz = Date.now();
    const dane = [];
    for (let m = 3 * 24 * 60; m > 0; m--) {
      const t = new Date(teraz - m * 60_000);
      const cicho = Number(godzinaPl.format(t)) === 3;
      for (const [k, cpu] of [[a, cicho ? 10 : 100], [b, 50]] as const) {
        dane.push({
          subscriptionId: k.subscription.id, accountId: k.account.id, serverId: w.id,
          bucketStart: t, bucketDurationS: 60, cpuUsageAvg: cpu, memUsageAvgMb: 1024, diskUsageMb: 10_000, ioUsageKbps: 0,
        });
      }
    }
    await prisma().usageMetric.createMany({ data: dane });

    const p = prisma() as never;
    const complete = vi.fn();
    const provider = { dostepny: vi.fn(async () => false), complete };
    const serwis = new PrognozaWezlaService(p, new StosWezlaService(p, new AuditService(p)), new AiService(p, provider as never, { record: async () => undefined } as never), provider as never);

    const r = await serwis.wezel(w.id, 'op');
    expect(r.dostepna).toBe(true);
    expect(r.confidence).toBe('high');
    const zasob = (x: string) => r.resources.find((z) => z.resource === x)!;
    // RAM: 2 × 1024 MB z 8192 MB = 25%; CPU: (100 + 50)% rdzenia / 4 rdzenie = 37,5% (o 03:00 15%)
    expect(zasob('RAM').currentPct).toBe(25);
    expect(zasob('CPU').currentPct).toBeGreaterThanOrEqual(15);
    expect(zasob('CPU').currentPct).toBeLessThanOrEqual(37.5);
    expect(zasob('DISK').currentPct).toBe(10);
    expect(zasob('CPU').historia!.length).toBeGreaterThanOrEqual(72);
    expect(r.oknoAktualizacji).toEqual({ godzina: 3, cpuProc: 15 });
    expect(r.kandydaci.map((k) => [k.etykieta, k.domena, k.subscriptionId])).toEqual([
      ['konto 1', a.account.domain, a.subscription.id],
      ['konto 2', b.account.domain, b.subscription.id],
    ]);
    expect(r.zapas).toMatchObject({ noweKonta30d: 2 });
    expect(r.komentarzAi).toBe(false);

    // Komentarz innego węzła nie może trafić tutaj; własny z < 24 h — bez wywołania dostawcy.
    const log = (serverId: string, podsumowanie: string) =>
      prisma().aiInteractionLog.create({
        data: { feature: 'node_forecast', provider: 'anthropic', status: 'COMPLETED', promptHash: 'x', inputSummary: { serverId, konta: [b.account.id] }, output: { podsumowanie, zalecenia: ['Przenieś konto 1 na fsn-02.'] } },
      });
    await log(inny.id, 'Obcy węzeł.');
    await log(w.id, 'Węzeł w normie.');
    provider.dostepny.mockResolvedValue(true);
    const z = await serwis.wezel(w.id, 'op');
    expect(complete).not.toHaveBeenCalled();
    expect(z).toMatchObject({ komentarzAi: true, podsumowanie: 'Węzeł w normie.', zalecenia: [`Przenieś konto ${b.account.domain} na fsn-02.`] });

    const f = await serwis.flota('op');
    const fsn = f.wezly.find((x) => x.id === w.id)!;
    expect(fsn).toMatchObject({ dostepna: true, linia: { tekst: 'w normie przez 30 dni', ton: null } });
    expect(f.wezly.find((x) => x.id === inny.id)).toMatchObject({ dostepna: false });
  });
});

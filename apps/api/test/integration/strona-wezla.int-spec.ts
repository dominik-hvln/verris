import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { StosWezlaService } from '../../src/servers/stos-wezla.service.js';
import { PrzegladWezlaService } from '../../src/servers/przeglad-wezla.service.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * PB-34 — strona węzła (makieta AdminWezel) na prawdziwej bazie: zasoby z próbek kont (nie z przydziału),
 * najbardziej obciążone konto względem własnego limitu, gotowość z pól raportowanych przez agenta,
 * zgodność z manifestem i ostatnie zadania po polsku.
 */
const serwis = () => {
  const p = prisma() as never;
  return new PrzegladWezlaService(p, new StosWezlaService(p, new AuditService(p)));
};
const MIN = 60_000;

describe('PB-34 — przegląd węzła', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('zasoby realne, obciążone konta, gotowość, zgodność, zadania', async () => {
    const w = await utworzWezel({
      name: 'node-pl-01',
      totalCpuCores: 4,
      totalMemoryMb: 8192,
      allocatedCpu: 600,
      overcommitCpu: 3,
      maxAccounts: 10,
      hardenedEnabled: true,
      lastOffsiteBackupAt: new Date(Date.now() - 3 * 3600_000),
      lastOffsiteBackupOk: true,
      cagefsEnabled: false,
      dbVersion: '10.6.21',
      onboardReport: { ok: true, fail: 0, warn: 1 },
    });
    const k = await prisma().user.create({ data: { email: `pb34w-${Date.now()}@test.verris.pl`, passwordHash: 'x', companyName: 'Piekarnia Zdrój' } });
    const plan = await utworzPlan({ name: 'Hosting Biznes' });
    const konta: string[] = [];
    for (const [i, cpu, limit, skala] of [[0, 150, 200, 50], [1, 20, 100, 0]] as const) {
      const s = await prisma().subscription.create({
        data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN' } as never,
      });
      const a = await prisma().account.create({
        data: { daUsername: `pb34w${i}`, domain: `pb34w-${i}.pl`, userId: k.id, subscriptionId: s.id, serverId: w.id, cpuLimit: limit, scaledCpu: skala } as never,
      });
      konta.push(a.id);
      // starsza próbka nie może zawyżyć wyniku — liczy się najnowsza z 10 min
      for (const [m, c] of [[8, 999], [2, cpu]] as const) {
        await prisma().usageMetric.create({
          data: { subscriptionId: s.id, accountId: a.id, serverId: w.id, bucketStart: new Date(Date.now() - m * MIN), bucketDurationS: 60, cpuUsageAvg: c, memUsageAvgMb: 512, diskUsageMb: 1024 },
        });
      }
    }
    await prisma().nodeTask.create({ data: { serverId: w.id, kind: 'PHP_APPLY', status: 'FAILED', accountId: konta[0], errorMessage: 'strona zwróciła 500' } });

    const p = await serwis().przeglad(w.id);
    // (150 + 20)% rdzenia / 4 rdzenie = 42,5% → 43
    expect(p.zasoby.cpu).toMatchObject({ proc: 43, rdzenie: 4, sprzedane: 1.5, limit: 3 });
    expect(p.zasoby.ram).toMatchObject({ uzyteMb: 1024, razemMb: 8192 });
    expect(p.zasoby.konta).toEqual({ razem: 2, limit: 10, autoskalowane: 1 });
    // 150 / (200 + 50) = 60%, 20 / 100 = 20%
    expect(p.obciazone.map((o) => [o.domena, o.proc, o.autoskalowanieCpu])).toEqual([['pb34w-0.pl', 60, 25], ['pb34w-1.pl', 20, 0]]);
    expect(p.obciazone[0]!.klient).toBe('Piekarnia Zdrój');
    const g = Object.fromEntries(p.gotowosc.map((x) => [x.co, x.stan]));
    expect(g).toMatchObject({ 'Weryfikacja onboardu': 'ok', 'Utwardzenie i blokada ruchu wychodzącego': 'ok', 'Kopie poza serwerem': 'ok', 'CageFS (izolacja kont)': 'crit' });
    const maria = p.zgodnosc.pozycje.find((x) => x.co === 'MariaDB')!;
    expect(maria).toMatchObject({ oczekiwane: '11.4', faktyczne: '10.6.21', zgodne: false });
    expect(p.doNaprawy).toBeGreaterThanOrEqual(2);
    expect(p.zadania[0]).toMatchObject({ status: 'FAILED', tekst: 'Zmiana PHP · pb34w-0.pl', blad: 'strona zwróciła 500' });
    expect(p).toMatchObject({ nazwa: 'node-pl-01', stan: 'ok', poza: null, sygnal: 'na żywo' });
  });
});

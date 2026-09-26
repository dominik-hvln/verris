import { oblozenieWezla, zuzycieZProbek } from './node-capacity.js';

/** Z-15 — watchdog ostrzega o realnym zapełnieniu, a sprzedaż liczy względem nadsubskrypcji. */
describe('oblozenieWezla / zuzycieZProbek', () => {
  const fizyczna = { cpu: 1600, ramMb: 128_000, diskMb: 2_000_000 };
  const polityka = { overcommitCpu: 8, overcommitRam: 4, overcommitDisk: 2, reservedHeadroomPercent: 20 };

  it('sprzedaż jest liczona względem pojemności z nadsubskrypcją, nie samej fizycznej', () => {
    const ob = oblozenieWezla({
      fizyczna,
      sprzedane: { cpu: 3200, ramMb: 256_000, diskMb: 2_000_000 },
      zuzycie: { cpu: 0, ramMb: 0, diskMb: 0 },
      polityka,
    });
    // 3200 / (1600×8) = 25%; 256000 / (128000×4) = 50%; 2e6 / (2e6×2) = 50%
    expect(ob.sprzedaz).toEqual({ cpu: 25, ram: 50, disk: 50 });
  });

  it('realne zużycie względem pojemności fizycznej po rezerwie (headroom)', () => {
    const ob = oblozenieWezla({
      fizyczna,
      sprzedane: { cpu: 0, ramMb: 0, diskMb: 0 },
      zuzycie: { cpu: 640, ramMb: 81_920, diskMb: 1_280_000 },
      polityka,
    });
    // dostępne: 1280 CPU, 102400 MB RAM, 1.6e6 MB dysku
    expect(ob.fizyczne).toEqual({ cpu: 50, ram: 80, disk: 80 });
  });

  it('bez świeżej telemetrii: fizyczne = null, a nadsubskrypcja spada do 1× (zachowawczo)', () => {
    const ob = oblozenieWezla({ fizyczna, sprzedane: { cpu: 1600, ramMb: 64_000, diskMb: 0 }, zuzycie: null, polityka });
    expect(ob.fizyczne).toBeNull();
    expect(ob.sprzedaz.cpu).toBe(100);
    expect(ob.sprzedaz.ram).toBe(50);
  });

  it('zuzycieZProbek: jedna najnowsza próbka na subskrypcję, suma per węzeł', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 8, 23, 12, m));
    const m = zuzycieZProbek([
      { serverId: 'w1', subscriptionId: 's1', bucketStart: t(0), cpuUsageMax: 999, memUsageMaxMb: 999, diskUsageMb: 999 },
      { serverId: 'w1', subscriptionId: 's1', bucketStart: t(10), cpuUsageMax: 50, memUsageMaxMb: 500, diskUsageMb: 1000 },
      { serverId: 'w1', subscriptionId: 's2', bucketStart: t(5), cpuUsageMax: 25, memUsageMaxMb: 250, diskUsageMb: 500 },
      { serverId: null, subscriptionId: 's3', bucketStart: t(5), cpuUsageMax: 1, memUsageMaxMb: 1, diskUsageMb: 1 },
    ]);
    expect(m.get('w1')).toEqual({ cpu: 75, ramMb: 750, diskMb: 1500 });
    expect(m.size).toBe(1);
  });
});

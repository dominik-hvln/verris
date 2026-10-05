import { WykresyFlotyService, seriaFloty, serieWezlow, sortZ, sortujWezly, stanWezlaWykresy, zakresZ, type StanWykresu } from './wykresy-floty.js';

const TERAZ = Date.parse('2026-10-05T12:00:00Z');
const MIN = 60_000;
const wezel = (z: Partial<Parameters<typeof stanWezlaWykresy>[0]> = {}) => ({
  status: 'ACTIVE',
  lastSignalAt: new Date(TERAZ - MIN),
  cpuNow: 10,
  ramNow: 10,
  diskPct: 10,
  ...z,
});

describe('Flota — wykresy: stan węzła', () => {
  it.each<[string, Partial<Parameters<typeof stanWezlaWykresy>[0]>, StanWykresu]>([
    ['w normie', {}, 'norma'],
    ['brak telemetrii 16 min', { lastSignalAt: new Date(TERAZ - 16 * MIN) }, 'krytyczny'],
    ['telemetria 14 min temu', { lastSignalAt: new Date(TERAZ - 14 * MIN) }, 'norma'],
    ['nigdy nie wysłał', { lastSignalAt: null }, 'krytyczny'],
    ['serwis bez sygnału to nie alarm', { status: 'MAINTENANCE', lastSignalAt: null }, 'norma'],
    ['offline', { status: 'OFFLINE' }, 'krytyczny'],
    ['CPU 90%', { cpuNow: 90 }, 'krytyczny'],
    ['dysk 90%', { diskPct: 90 }, 'krytyczny'],
    ['CPU 75%', { cpuNow: 75 }, 'ostrzezenie'],
    ['RAM 85%', { ramNow: 85 }, 'ostrzezenie'],
    ['RAM 99% to tylko ostrzeżenie', { ramNow: 99 }, 'ostrzezenie'],
    ['dysk 80%', { diskPct: 80 }, 'ostrzezenie'],
    ['CPU 74%, RAM 84%, dysk 79%', { cpuNow: 74, ramNow: 84, diskPct: 79 }, 'norma'],
    ['brak próbek', { cpuNow: null, ramNow: null, diskPct: null }, 'norma'],
  ])('%s', (_, z, stan) => {
    expect(stanWezlaWykresy(wezel(z), TERAZ)).toBe(stan);
  });
});

describe('Flota — wykresy: sortowanie', () => {
  const w = [
    { name: 'a', stan: 'norma' as const, cpuNow: 50, ramNow: 10 },
    { name: 'b', stan: 'krytyczny' as const, cpuNow: 5, ramNow: 20 },
    { name: 'c', stan: 'ostrzezenie' as const, cpuNow: 80, ramNow: 90 },
    { name: 'd', stan: 'krytyczny' as const, cpuNow: 95, ramNow: null },
    { name: 'e', stan: 'norma' as const, cpuNow: null, ramNow: 30 },
  ];
  const nazwy = (s: Parameters<typeof sortujWezly>[1]) => sortujWezly(w, s).map((x) => x.name);

  it('stan: krytyczne, ostrzeżenia, w normie — w grupie CPU malejąco', () => {
    expect(nazwy('stan')).toEqual(['d', 'b', 'c', 'a', 'e']);
  });
  it('CPU, pamięć malejąco (brak próbek na końcu), nazwa rosnąco', () => {
    expect(nazwy('cpu')).toEqual(['d', 'c', 'a', 'b', 'e']);
    expect(nazwy('ram')).toEqual(['c', 'e', 'b', 'a', 'd']);
    expect(nazwy('nazwa')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('parametry spoza listy → domyślne', () => {
    expect([zakresZ('7d'), zakresZ('__proto__'), zakresZ(undefined)]).toEqual(['7d', '24h', '24h']);
    expect([sortZ('ram'), sortZ('x')]).toEqual(['ram', 'stan']);
  });
});

describe('Flota — wykresy: serie', () => {
  const t1 = new Date('2026-10-05T10:00:00Z');
  const t2 = new Date('2026-10-05T11:00:00Z');

  it('% rdzeni i RAM węzła, punkty po czasie, węzeł bez pojemności bez serii CPU', () => {
    const s = serieWezlow(
      [
        { serverId: 'w1', t: t2, cpu: 200, ram: 2048, dysk: 0 },
        { serverId: 'w1', t: t1, cpu: 160, ram: 1536, dysk: 0 },
        { serverId: 'w2', t: t1, cpu: 900, ram: 100, dysk: 0 },
        { serverId: 'obcy', t: t1, cpu: 1, ram: 1, dysk: 0 },
      ],
      new Map([
        ['w1', { rdzenie: 4, ramMb: 8192 }],
        ['w2', { rdzenie: null, ramMb: 1000 }],
      ]),
    );
    expect(s.get('w1')).toEqual({
      cpu: [
        { t: t1.toISOString(), v: 40 },
        { t: t2.toISOString(), v: 50 },
      ],
      ram: [
        { t: t1.toISOString(), v: 18.8 },
        { t: t2.toISOString(), v: 25 },
      ],
    });
    expect(s.get('w2')).toEqual({ cpu: [], ram: [{ t: t1.toISOString(), v: 10 }] });
    expect(s.has('obcy')).toBe(false);
  });

  it('seria floty = średnia węzłów obecnych w kubełku', () => {
    expect(
      seriaFloty([
        [{ t: 'b', v: 30 }, { t: 'a', v: 10 }],
        [{ t: 'a', v: 20 }],
      ]),
    ).toEqual([
      { t: 'a', v: 15 },
      { t: 'b', v: 30 },
    ]);
  });

  it('serwis: SQL sumuje konta przed uśrednieniem, kubełek wg zakresu, KPI i sortowanie', async () => {
    const serwer = (id: string, z: Record<string, unknown> = {}) => ({
      id,
      name: id,
      hostname: null,
      ipAddress: `10.0.0.${id.length}`,
      region: 'DE-FSN',
      status: 'ACTIVE',
      acceptsNewAccounts: true,
      lastHeartbeatAt: new Date(TERAZ - MIN),
      onboardVerifiedAt: new Date(TERAZ - 86_400_000),
      onboardReport: null,
      maintenanceReason: null,
      totalCpuCores: 4,
      totalMemoryMb: 8192,
      totalDiskMb: 10_000,
      allocatedCpu: 200,
      allocatedMemory: 4096,
      allocatedDisk: 9000,
      overcommitCpu: 1,
      overcommitRam: 1,
      overcommitDisk: 1,
      reservedHeadroomPercent: 0,
      lastOffsiteBackupAt: null,
      _count: { accounts: 2 },
      ...z,
    });
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        { serverId: 'spokojny', t: new Date('2026-10-05T11:00:00Z'), cpu: 160, ram: 1536 },
        { serverId: 'goracy', t: new Date('2026-10-05T11:00:00Z'), cpu: 360, ram: 4096 },
      ])
      .mockResolvedValueOnce([
        { serverId: 'spokojny', cpu: 100, ram: 1024, dysk: 1000 },
        { serverId: 'goracy', cpu: 380, ram: 1024, dysk: 1000 },
      ]);
    const prisma = {
      server: { findMany: vi.fn().mockResolvedValue([serwer('spokojny'), serwer('goracy'), serwer('test', { acceptsNewAccounts: false, lastHeartbeatAt: new Date(TERAZ - 20 * MIN) })]) },
      $queryRaw: queryRaw,
    };
    const r = await new WykresyFlotyService(prisma as never).wykresy('1h', 'stan', TERAZ);

    const sql = (queryRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(/SUM\("cpuUsageAvg"\)[\s\S]*GROUP BY "serverId", "bucketStart"[\s\S]*AVG\(cpu\)/);
    expect(queryRaw.mock.calls[0]).toContain('5 minutes');
    expect(queryRaw.mock.calls[0]).toContainEqual(new Date(TERAZ - 3_600_000));

    expect(r.wezly.map((w) => [w.name, w.stan, w.cpuNow])).toEqual([
      ['goracy', 'krytyczny', 95],
      ['test', 'krytyczny', null],
      ['spokojny', 'norma', 25],
    ]);
    expect(r.wezly[0]).toMatchObject({ accounts: 2, pozaPula: null, ramNow: 13, diskPct: 10, cpu: [{ t: '2026-10-05T11:00:00.000Z', v: 90 }], ram: [{ t: '2026-10-05T11:00:00.000Z', v: 50 }] });
    expect(r.wezly[1]).toMatchObject({ pozaPula: 'poza pulą — wstrzymany', cpu: [], ram: [] });
    expect(r.kpi).toMatchObject({
      wszystkie: 3,
      aktywne: 3,
      pozaPula: 1,
      cpu: [{ t: '2026-10-05T11:00:00.000Z', v: 65 }],
      cpuSrednie: 65,
      ramSrednie: 34,
      // dysk 27 000 / 30 000 MB — najbliżej limitu (CPU 600/1200, RAM 12 288/24 576)
      pojemnosc: { wymiar: 'dysk', proc: 90 },
    });
  });
});

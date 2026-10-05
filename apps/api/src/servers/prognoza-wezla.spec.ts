import { AiService } from '../ai/ai.service.js';
import type { ServiceForecastResourceDto } from '@verris/contracts';
import { STOS_WEZLA } from './stos-wezla.js';
import {
  PrognozaWezlaService,
  kandydaciDoPrzeniesienia,
  liniaKarty,
  najcichszaGodzina,
  opisFloty,
  podstawDomeny,
  sygnalyWezla,
  zKomentarza,
  zapasPuli,
} from './prognoza-wezla.js';

const H = 3_600_000;
const DZIEN = 24 * H;
const TERAZ = Date.parse('2026-10-05T12:00:00Z');
const pomiar = (t: number, cpu: number) => ({ bucketStart: new Date(t), cpuUsageAvg: cpu, memUsageAvgMb: 0, diskUsageMb: 0, ioUsageKbps: 0 });
const zasob = (resource: 'CPU' | 'RAM' | 'DISK', currentPct: number, daysToLimit: number | null): ServiceForecastResourceDto =>
  ({ resource, currentPct, predictedPct: currentPct, trend: 'flat', daysToLimit, note: null }) as ServiceForecastResourceDto;

describe('najcichsza godzina (czas polski)', () => {
  it('01:00 UTC w październiku (CEST) → 03:00, średnia CPU w % mocy węzła', () => {
    const p = [];
    for (let t = TERAZ - 2 * DZIEN; t < TERAZ; t += H) p.push(pomiar(t, new Date(t).getUTCHours() === 1 ? 20 : 300));
    expect(najcichszaGodzina(p, 400)).toEqual({ godzina: 3, cpuProc: 5 });
  });
  it('bez próbek albo bez rdzeni → null', () => {
    expect(najcichszaGodzina([], 400)).toBeNull();
    expect(najcichszaGodzina([pomiar(TERAZ, 1)], 0)).toBeNull();
  });
});

describe('zapas puli w standardowych kontach (2 vCPU / 8 GB / 50 GB)', () => {
  const wezel = {
    totalCpuCores: 32,
    totalMemoryMb: 128 * 1024,
    totalDiskMb: 1920 * 1024,
    allocatedCpu: 2000,
    allocatedMemory: 6 * 8192,
    allocatedDisk: 6 * 51200,
    overcommitCpu: 2,
    overcommitRam: 2,
    overcommitDisk: 1,
    reservedHeadroomPercent: 0,
    maxAccounts: null,
  };
  it('overcommit przy świeżej telemetrii, wymiar najbliżej końca, dni przy tempie z 30 dni', () => {
    // CPU (6400 − 2000) / 200 = 22, RAM (262144 − 49152) / 8192 = 26, dysk (1966080 − 307200) / 51200 = 32
    expect(zapasPuli(wezel, { konta: 6, swieza: true, nowe30: 3 })).toEqual({ kont: 22, wymiar: 'CPU', noweKonta30d: 3, dniDoWyczerpania: 220 });
  });
  it('bez telemetrii overcommit = 1; limit kont węzła; bez nowych kont brak daty', () => {
    expect(zapasPuli(wezel, { konta: 6, swieza: false, nowe30: 0 })).toMatchObject({ kont: 6, wymiar: 'CPU', dniDoWyczerpania: null });
    expect(zapasPuli({ ...wezel, maxAccounts: 7 }, { konta: 6, swieza: true, nowe30: 0 })).toMatchObject({ kont: 1, wymiar: 'limit kont' });
    expect(zapasPuli({ ...wezel, allocatedCpu: 9000 }, { konta: 6, swieza: true, nowe30: 2 })).toMatchObject({ kont: 0, dniDoWyczerpania: 0 });
    expect(zapasPuli({ ...wezel, totalDiskMb: null }, { konta: 0, swieza: true, nowe30: 0 })).toBeNull();
  });
});

describe('kandydaci, sygnały, linia karty, opis floty, odpowiedź AI', () => {
  it('kandydaci: udział w CPU węzła i moc węzła, etykiety konto 1..N', () => {
    expect(kandydaciDoPrzeniesienia([{ accountId: 'b', cpu: 25 }, { accountId: 'a', cpu: 75 }, { accountId: 'c', cpu: 0 }], 400, 2)).toEqual([
      { etykieta: 'konto 1', accountId: 'a', udzialProc: 75, mocWezlaProc: 18.8 },
      { etykieta: 'konto 2', accountId: 'b', udzialProc: 25, mocWezlaProc: 6.3 },
    ]);
    expect(kandydaciDoPrzeniesienia([{ accountId: 'a', cpu: 0 }], 400)).toEqual([]);
  });

  it('sygnały: limit RAM, dysk ≥ 80%, stos, kopia off-site, wyczerpana pula', () => {
    const s = sygnalyWezla({
      resources: [zasob('CPU', 30, null), zasob('RAM', 70, 12), zasob('DISK', 91, 3)],
      rozjazdy: 2,
      lastOffsiteBackupAt: new Date(TERAZ - 30 * H),
      lastOffsiteBackupOk: true,
      zapas: { kont: 0, wymiar: 'RAM', noweKonta30d: 0, dniDoWyczerpania: null },
      teraz: TERAZ,
    });
    expect(s).toEqual([
      { ton: 'crit', tekst: 'Limit dysku za ~3 dni' },
      { ton: 'warn', tekst: 'Limit RAM za ~12 dni' },
      { ton: 'crit', tekst: 'Dysk zajęty w 91%' },
      { ton: 'warn', tekst: 'Stos nieaktualny względem manifestu floty (rozjazdy: 2)' },
      { ton: 'crit', tekst: 'Brak udanej kopii poza serwerem w ostatnich 24 h' },
      { ton: 'warn', tekst: 'Pula sprzedażowa wyczerpana (RAM)' },
    ]);
    expect(
      sygnalyWezla({ resources: [zasob('RAM', 40, null)], rozjazdy: 0, lastOffsiteBackupAt: new Date(TERAZ - H), lastOffsiteBackupOk: true, zapas: null, teraz: TERAZ }),
    ).toEqual([]);
  });

  it('linia karty i opis floty bez AI', () => {
    expect(liniaKarty([zasob('CPU', 10, null), zasob('RAM', 80, 9)], true)).toEqual({ tekst: 'limit RAM za ~9 dni', ton: 'warn' });
    expect(liniaKarty([zasob('CPU', 10, null)], true)).toEqual({ tekst: 'w normie przez 30 dni', ton: null });
    expect(liniaKarty([], false).tekst).toBe('za mało danych do prognozy');
    const zapas = (kont: number) => ({ kont, wymiar: 'CPU', noweKonta30d: 0, dniDoWyczerpania: null });
    expect(
      opisFloty([
        { nazwa: 'fsn-01', wPuli: true, resources: [zasob('RAM', 80, 9)], zapas: zapas(3) },
        { nazwa: 'fsn-02', wPuli: true, resources: [zasob('DISK', 50, 20)], zapas: zapas(19) },
        { nazwa: 'serwis', wPuli: false, resources: [], zapas: zapas(50) },
      ]),
    ).toBe('Najbliżej limitu: fsn-01 — RAM za ok. 9 dni. Pula floty zmieści jeszcze ok. 22 konta w pakiecie standardowym.');
    expect(opisFloty([{ nazwa: 'a', wPuli: true, resources: [], zapas: zapas(5) }])).toBe('Wszystkie węzły w normie przez 30 dni. Pula floty zmieści jeszcze ok. 5 kont w pakiecie standardowym.');
  });

  it('odpowiedź AI: tylko poprawny kształt, ≤ 4 zalecenia; „konto N” → domena', () => {
    expect(zKomentarza({ podsumowanie: ' Ok. ', zalecenia: ['a', 1, '', 'b', 'c', 'd', 'e'] })).toEqual({ podsumowanie: 'Ok.', zalecenia: ['a', 'b', 'c', 'd'] });
    expect(zKomentarza({ summary: 'x' })).toBeNull();
    expect(podstawDomeny('Przenieś konto 1 na fsn-02, z kontem 2 poczekaj; konto 10 bez zmian.', new Map([[1, 'sklep.pl'], [2, 'blog.pl']]))).toBe(
      'Przenieś konto sklep.pl na fsn-02, z kontem blog.pl poczekaj; konto 10 bez zmian.',
    );
  });
});

describe('PrognozaWezlaService — AI tylko komentuje liczby panelu', () => {
  const serwer = {
    id: 'w1',
    name: 'fsn-01',
    hostname: null,
    ipAddress: '10.0.0.1',
    status: 'ACTIVE',
    lastHeartbeatAt: new Date(TERAZ),
    onboardReport: null,
    maintenanceReason: null,
    onboardVerifiedAt: new Date(TERAZ - 30 * DZIEN),
    acceptsNewAccounts: true,
    totalCpuCores: 4,
    totalMemoryMb: 8192,
    totalDiskMb: 100_000,
    allocatedCpu: 400,
    allocatedMemory: 16384,
    allocatedDisk: 102400,
    overcommitCpu: 4,
    overcommitRam: 4,
    overcommitDisk: 2,
    reservedHeadroomPercent: 0,
    maxAccounts: null,
    stackVersion: STOS_WEZLA.wersja,
    dbVersion: null,
    lsVersion: null,
    phpDefaultVersion: null,
    lastOffsiteBackupAt: new Date(TERAZ - 2 * H),
    lastOffsiteBackupOk: true,
    _count: { accounts: 2 },
  };
  // 3 doby godzinowo: RAM rośnie 2%/dzień, CPU najniżej o 02:00 UTC (04:00 w Polsce)
  const seria = Array.from({ length: 72 }, (_, i) => {
    const t = new Date(TERAZ - (72 - i) * H);
    return { serverId: 'w1', t, cpu: t.getUTCHours() === 2 ? 40 : 200, ram: 4096 + (i / 24) * 0.02 * 8192, dysk: 30_000 };
  });
  const atrapa = () => {
    const prisma = {
      server: { findMany: vi.fn(async () => [serwer]) },
      account: {
        groupBy: vi.fn(async () => [{ serverId: 'w1', _count: { _all: 3 } }]),
        findMany: vi.fn(async () => [
          { id: 'a1', domain: 'piekarnia-zdroj.pl', subscriptionId: 's1' },
          { id: 'a2', domain: 'kwiaty.pl', subscriptionId: 's2' },
        ]),
      },
      $queryRaw: vi.fn(async (sql: TemplateStringsArray) => {
        const q = sql.join('?');
        if (q.includes('DISTINCT "serverId"')) return [{ serverId: 'w1' }];
        if (q.includes('date_bin')) return seria;
        return [{ accountId: 'a2', cpu: 30 }, { accountId: 'a1', cpu: 90 }];
      }),
      aiInteractionLog: { findFirst: vi.fn(async (): Promise<unknown> => null), create: vi.fn(async () => ({})) },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const complete = vi.fn(async () => ({
      wynik: { podsumowanie: 'RAM rośnie.', zalecenia: ['Przenieś konto 1 na fsn-02.', 'Aktualizacja o 04:00.'] },
      dostawca: 'anthropic',
      model: 'm',
      wej: 1,
      wyj: 1,
      kosztUsd: 0,
    }));
    const provider = { dostepny: vi.fn(async () => true), complete, opis: vi.fn(async () => ({ dostawca: 'anthropic', model: 'm' })) };
    const ai = new AiService(prisma as never, provider as never, audit as never);
    const svc = new PrognozaWezlaService(prisma as never, { pobierz: async () => STOS_WEZLA } as never, ai, provider as never);
    return { prisma, provider, complete, svc };
  };

  it('bez AI: liczby + tekst panelu, komentarzAi false', async () => {
    const { svc, provider, complete } = atrapa();
    provider.dostepny.mockResolvedValue(false);
    const r = await svc.wezel('w1', 'op', TERAZ);
    expect(complete).not.toHaveBeenCalled();
    expect(r.komentarzAi).toBe(false);
    expect(r.zalecenia).toEqual([]);
    expect(r.podsumowanie).toMatch(/limit węzła|Najbliżej limitu/);
    expect(r.oknoAktualizacji).toEqual({ godzina: 4, cpuProc: 10 });
    expect(r.resources.find((x) => x.resource === 'RAM')).toMatchObject({ trend: 'up' });
    expect(r.kandydaci.map((k) => [k.etykieta, k.domena, k.udzialProc])).toEqual([['konto 1', 'piekarnia-zdroj.pl', 75], ['konto 2', 'kwiaty.pl', 25]]);
    // CPU (1600 − 400) / 200 = 6, RAM (32768 − 16384) / 8192 = 2, dysk (200000 − 102400) / 51200 = 1
    expect(r.zapas).toMatchObject({ kont: 1, wymiar: 'dysk', noweKonta30d: 3, dniDoWyczerpania: 10 });
  });

  it('z AI: do AI idą tylko liczby i „konto N” (bez domen i e-maili), panel mapuje konta na domeny', async () => {
    const { svc, complete, prisma } = atrapa();
    const r = await svc.wezel('w1', 'op', TERAZ);
    const wejscie = (complete.mock.calls[0] as unknown as [{ user: string; system: string }])[0];
    expect(wejscie.user).not.toMatch(/piekarnia|kwiaty|\.pl|@/);
    expect(wejscie.user).not.toContain('historia');
    expect(JSON.parse(wejscie.user).kandydaci).toEqual([
      { konto: 'konto 1', udzialWCpuWezlaProc: 75, mocWezlaProc: 22.5 },
      { konto: 'konto 2', udzialWCpuWezlaProc: 25, mocWezlaProc: 7.5 },
    ]);
    expect(r.komentarzAi).toBe(true);
    expect(r.zalecenia).toEqual(['Przenieś konto piekarnia-zdroj.pl na fsn-02.', 'Aktualizacja o 04:00.']);
    expect(prisma.aiInteractionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ feature: 'node_forecast', inputSummary: { serverId: 'w1', konta: ['a1', 'a2'] } }),
    });
  });

  it('komentarz z ostatnich 24 h: bez wywołania dostawcy, mapowanie kont z zapisu', async () => {
    const { svc, complete, prisma } = atrapa();
    prisma.aiInteractionLog.findFirst.mockResolvedValue({
      output: { podsumowanie: 'Z pamięci.', zalecenia: ['Przenieś konto 1.'] },
      inputSummary: { serverId: 'w1', konta: ['a2'] },
    });
    const r = await svc.wezel('w1', 'op', TERAZ);
    expect(complete).not.toHaveBeenCalled();
    expect(prisma.aiInteractionLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feature: 'node_forecast', inputSummary: { path: ['serverId'], equals: 'w1' }, createdAt: { gte: new Date(TERAZ - DZIEN) } }),
      }),
    );
    expect(r.podsumowanie).toBe('Z pamięci.');
    expect(r.zalecenia).toEqual(['Przenieś konto kwiaty.pl.']);
  });

  it('błąd AI → liczby bez komentarza; flota: linia karty i podsumowanie panelu', async () => {
    const { svc, complete } = atrapa();
    complete.mockRejectedValue(new Error('limit'));
    const w = await svc.wezel('w1', 'op', TERAZ);
    expect(w.komentarzAi).toBe(false);
    const f = await svc.flota('op', TERAZ);
    expect(f.komentarzAi).toBe(false);
    expect(f.wezly[0]).toMatchObject({ nazwa: 'fsn-01', wPuli: true, dostepna: true });
    expect(f.wezly[0]!.resources[0]).not.toHaveProperty('historia');
    expect(f.podsumowanie).toMatch(/Pula floty zmieści jeszcze ok\. 1 konto w pakiecie standardowym\./);
  });
});

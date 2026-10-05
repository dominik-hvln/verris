import { AiService } from './ai.service.js';
import { AiProviderService } from './ai-provider.service.js';
import { opisPrognozy, policzPrognoze, type Pomiar } from './prognoza-zasobow.js';

/** 2026-10-05 — prognoza liczona w panelu, AI tylko komentuje; budżet AI całej platformy. */
const plan = { name: 'Starter', cpuLimit: 100, ramLimitMb: 1000, diskLimitMb: 1000, ioLimitKbps: 10240 };
const godz = (h: number, disk: number, ram = 300): Pomiar => ({
  bucketStart: new Date(Date.UTC(2026, 9, 1) + h * 3_600_000),
  cpuUsageAvg: 20,
  memUsageAvgMb: ram,
  diskUsageMb: disk,
  ioUsageKbps: 100,
});
// dysk rośnie o 1% limitu na godzinę przez 4 dni (96 pomiarów), od 0% do 95%
const pomiary = Array.from({ length: 96 }, (_, h) => godz(h, h * 10));

describe('prognoza zasobów bez AI', () => {
  it('regresja: dysk rośnie ~24%/dzień → limit za 1 dzień, RAM płasko bez limitu', () => {
    const p = policzPrognoze(plan, [...pomiary].reverse());
    const disk = p.resources.find((r) => r.resource === 'DISK')!;
    expect(disk.trend).toBe('up');
    expect(disk.currentPct).toBe(94);
    expect(disk.daysToLimit).toBe(1);
    expect(disk.predictedPct).toBeGreaterThan(200);
    const ram = p.resources.find((r) => r.resource === 'RAM')!;
    expect(ram).toMatchObject({ trend: 'flat', currentPct: 30, daysToLimit: null });
    expect(p.confidence).toBe('high');
    expect(opisPrognozy(p.resources)).toMatch(/^Najbliżej limitu: dysk — 94% teraz, limit za ok\. 1 dzień/);
  });

  it('wszystko płasko → opis „w normie”, krótkie dane → niska pewność', () => {
    const p = policzPrognoze(plan, Array.from({ length: 6 }, (_, h) => godz(h, 100)));
    expect(p.confidence).toBe('low');
    expect(opisPrognozy(p.resources)).toMatch(/w normie/);
  });
});

describe('AiService.serviceForecast — AI komentuje gotowe liczby', () => {
  const sub = { id: 's1', plan };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => sub) },
    $queryRaw: vi.fn(async () => pomiary),
    aiInteractionLog: { create: vi.fn(async () => ({})), findFirst: vi.fn(async (): Promise<{ output: unknown } | null> => null) },
  };
  const audit = { record: vi.fn(async () => undefined) };

  it('bez klucza AI: prognoza z liczbami i opisem panelu (available: true)', async () => {
    const provider = { dostepny: vi.fn(async () => false) };
    const r = await new AiService(prisma as never, provider as never, audit as never).serviceForecast('s1', 'u1', 'u1');
    expect(r.available).toBe(true);
    expect(r.resources.find((x) => x.resource === 'DISK')?.daysToLimit).toBe(1);
    expect(r.summary).toMatch(/Najbliżej limitu/);
    expect(r.komentarzAi).toBeUndefined();
  });

  it('z AI: poziom analiza, mały prompt z gotowymi liczbami; AI nie zmienia liczb', async () => {
    const complete = vi.fn(async () => ({
      wynik: { summary: 'Dysk zaraz się zapełni.', recommendations: ['Usuń stare kopie'], notes: { DISK: 'Rośnie szybko.' }, resources: [{ resource: 'DISK', currentPct: 1 }] },
      dostawca: 'openai', model: 'm', wej: 1, wyj: 1, kosztUsd: 0,
    }));
    const provider = { dostepny: vi.fn(async () => true), przekroczonyLimitKlienta: vi.fn(async () => null), complete };
    const r = await new AiService(prisma as never, provider as never, audit as never).serviceForecast('s1', 'u1', 'u1');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(String) }));
    const wyslane = JSON.parse((complete.mock.calls[0] as unknown as [{ user: string }])[0].user) as { resources: unknown[] };
    expect(wyslane.resources).toHaveLength(4);
    expect(r.summary).toBe('Dysk zaraz się zapełni.');
    expect(r.komentarzAi).toBe(true); // AI Act art. 50 — panel oznacza komentarz AI
    expect(r.recommendations).toEqual(['Usuń stare kopie']);
    const disk = r.resources.find((x) => x.resource === 'DISK')!;
    expect(disk).toMatchObject({ currentPct: 94, note: 'Rośnie szybko.' });
  });

  it('komentarz AI sprzed < 3 h: bez nowego wywołania (odświeżanie nie kosztuje)', async () => {
    prisma.aiInteractionLog.findFirst.mockResolvedValueOnce({ output: { summary: 'Z pamięci.', recommendations: [] } });
    const complete = vi.fn();
    const provider = { dostepny: vi.fn(async () => true), przekroczonyLimitKlienta: vi.fn(async () => null), complete };
    const r = await new AiService(prisma as never, provider as never, audit as never).serviceForecast('s1', 'u1', 'u1');
    expect(complete).not.toHaveBeenCalled();
    expect(r.summary).toBe('Z pamięci.');
  });
});

describe('budżet AI całej platformy', () => {
  it('suma miesiąca ≥ limit → odmowa bez wywołania dostawcy i jedno powiadomienie dla admina', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const notifications = { create: vi.fn(async () => undefined) };
    const prisma = {
      platformSetting: { findUnique: vi.fn(async () => ({ value: JSON.stringify({ limitPlatformyUsd: 20 }) })) },
      aiInteractionLog: { aggregate: vi.fn(async () => ({ _sum: { costUsd: 20.5 } })) },
      user: { findMany: vi.fn(async () => [{ id: 'admin1' }]) },
    };
    const s = new AiProviderService({ get: (k: string) => (k === 'AI_API_KEY' ? 'sk' : undefined) } as never, prisma as never, notifications as never);
    await expect(s.chat({ system: 's', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/niedostępny/);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin1', dedupeKey: 'ai-budzet-platformy' }));
  });
});

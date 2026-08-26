import { ServiceUnavailableException } from '@nestjs/common';
import { NodeSelectorService } from './node-selector.service';

/**
 * Z-12 — czy selektor faktycznie KORZYSTA z arytmetyki z node-capacity.
 *
 * Sama arytmetyka jest przetestowana osobno (node-capacity.spec.ts). Tutaj
 * pilnujemy podłączenia: czy serwis czyta współczynniki z węzła, czy pobiera
 * telemetrię, czy sumuje ją po jednej najnowszej próbce na subskrypcję i czy
 * sortuje kandydatów po właściwym obciążeniu.
 *
 * Bez tego pliku Z-12 byłoby przetestowaną biblioteką podpiętą w nieznany
 * sposób — czyli dokładnie tym, co audyt nazywa pokryciem pozornym.
 */

const PLAN = {
  slug: 'hosting-45',
  cpuLimit: 200,
  ramLimitMb: 8 * 1024,
  diskLimitMb: 50 * 1024,
} as never;

function wezel(over: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    region: 'PL-WAW',
    status: 'ACTIVE',
    acceptsNewAccounts: true,
    // OPS-01: domyślnie węzeł ŻYJE. Wcześniej fixture nie miał tego pola
    // wcale — czyli wszystkie testy pojemności opisywały maszynę, o której
    // nie wiadomo było, czy odpowiada.
    lastHeartbeatAt: new Date(),
    totalCpuCores: 32,
    totalMemoryMb: 128 * 1024,
    totalDiskMb: 1920 * 1024,
    allocatedCpu: 0,
    allocatedMemory: 0,
    allocatedDisk: 0,
    maxAccounts: null,
    reservedHeadroomPercent: 0,
    overcommitCpu: 1,
    overcommitRam: 1,
    overcommitDisk: 1,
    ...over,
  };
}

interface FakeOpts {
  servers: ReturnType<typeof wezel>[];
  liczbaKont?: Record<string, number>;
  metryki?: Array<{
    serverId: string;
    subscriptionId: string;
    bucketStart: Date;
    cpuUsageMax: number;
    memUsageMaxMb: number;
    diskUsageMb: number;
  }>;
}

function fakePrisma(o: FakeOpts) {
  return {
    server: {
      findMany: jest.fn(async ({ where }: never) => {
        const w = where as unknown as { status?: string };
        if (w?.status === 'MAINTENANCE') return [];
        return o.servers;
      }),
    },
    account: {
      groupBy: jest.fn(async () =>
        Object.entries(o.liczbaKont ?? {}).map(([serverId, n]) => ({
          serverId,
          _count: { _all: n },
        })),
      ),
    },
    usageMetric: {
      findMany: jest.fn(async () => o.metryki ?? []),
    },
  } as never;
}

describe('Z-12 — NodeSelectorService korzysta z nadsubskrypcji', () => {
  it('bez nadsubskrypcji odmawia, gdy sprzedano całą pojemność fizyczną', async () => {
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ allocatedMemory: 128 * 1024 })],
        liczbaKont: { w1: 16 },
        metryki: [
          {
            serverId: 'w1',
            subscriptionId: 's1',
            bucketStart: new Date(),
            cpuUsageMax: 10,
            memUsageMaxMb: 4096,
            diskUsageMb: 1024,
          },
        ],
      }),
    );
    await expect(s.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('z overcommitRam 4× ten sam węzeł przyjmuje konto', async () => {
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ allocatedMemory: 128 * 1024, overcommitRam: 4, overcommitCpu: 4 })],
        liczbaKont: { w1: 16 },
        metryki: [
          {
            serverId: 'w1',
            subscriptionId: 's1',
            bucketStart: new Date(),
            cpuUsageMax: 10,
            memUsageMaxMb: 4096,
            diskUsageMb: 1024,
          },
        ],
      }),
    );
    const wybrany = await s.pickServerForPlan(PLAN);
    expect(wybrany.id).toBe('w1');
  });

  it('nieświeża telemetria degraduje overcommit — węzeł znów odmawia', async () => {
    const staraProbka = new Date(Date.now() - 90 * 60_000); // 90 minut temu
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ allocatedMemory: 128 * 1024, overcommitRam: 4, overcommitCpu: 4 })],
        liczbaKont: { w1: 16 },
        metryki: [], // zapytanie z oknem świeżości nic nie zwróci
      }),
    );
    void staraProbka;
    await expect(s.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('świeży węzeł bez kont nie jest traktowany jak węzeł z zepsutym agentem', async () => {
    // Zero kont = zero telemetrii, ale realne zużycie jest ZNANE i wynosi zero.
    // Bez tego rozróżnienia nowy węzeł z ustawionym overcommitem zapełniałby się
    // najpierw do 16 kont, a nadsubskrypcja ruszałaby dopiero potem.
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ allocatedMemory: 100 * 1024, overcommitRam: 4, overcommitCpu: 4 })],
        liczbaKont: { w1: 0 },
        metryki: [],
      }),
    );
    const wybrany = await s.pickServerForPlan(PLAN);
    expect(wybrany.id).toBe('w1');
  });

  it('realne zużycie blokuje węzeł, choć handlowo ma zapas', async () => {
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [
          wezel({
            allocatedMemory: 8 * 1024, // sprzedane prawie nic
            overcommitRam: 4,
            reservedHeadroomPercent: 20,
          }),
        ],
        liczbaKont: { w1: 1 },
        metryki: [
          {
            serverId: 'w1',
            subscriptionId: 's1',
            bucketStart: new Date(),
            cpuUsageMax: 10,
            memUsageMaxMb: 120 * 1024, // ale maszyna zjedzona
            diskUsageMb: 1024,
          },
        ],
      }),
    );
    await expect(s.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('liczy jedną — najnowszą — próbkę na subskrypcję, nie sumuje okna', async () => {
    const teraz = Date.now();
    // Sześć próbek jednej subskrypcji po 20 GB. Zsumowane dałyby 120 GB
    // i zablokowały węzeł; poprawnie liczy się tylko najnowsza.
    const metryki = Array.from({ length: 6 }, (_, i) => ({
      serverId: 'w1',
      subscriptionId: 's1',
      bucketStart: new Date(teraz - i * 5 * 60_000),
      cpuUsageMax: 10,
      memUsageMaxMb: 20 * 1024,
      diskUsageMb: 1024,
    }));
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ allocatedMemory: 8 * 1024, overcommitRam: 4 })],
        liczbaKont: { w1: 1 },
        metryki,
      }),
    );
    const wybrany = await s.pickServerForPlan(PLAN);
    expect(wybrany.id).toBe('w1');
  });

  it('woli węzeł realnie luźniejszy, nie ten mniej sprzedany', async () => {
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [
          wezel({ id: 'zajety', allocatedMemory: 8 * 1024, overcommitRam: 4 }),
          wezel({ id: 'wolny', allocatedMemory: 64 * 1024, overcommitRam: 4 }),
        ],
        liczbaKont: { zajety: 1, wolny: 8 },
        metryki: [
          {
            serverId: 'zajety',
            subscriptionId: 's1',
            bucketStart: new Date(),
            cpuUsageMax: 10,
            memUsageMaxMb: 100 * 1024, // 78% maszyny
            diskUsageMb: 1024,
          },
          {
            serverId: 'wolny',
            subscriptionId: 's2',
            bucketStart: new Date(),
            cpuUsageMax: 10,
            memUsageMaxMb: 4 * 1024, // 3% maszyny
            diskUsageMb: 1024,
          },
        ],
      }),
    );
    const wybrany = await s.pickServerForPlan(PLAN);
    expect(wybrany.id).toBe('wolny');
  });

  it('maxAccounts nadal obowiązuje mimo nadsubskrypcji', async () => {
    const s = new NodeSelectorService(
      fakePrisma({
        servers: [wezel({ maxAccounts: 5, overcommitRam: 8, overcommitCpu: 8 })],
        liczbaKont: { w1: 5 },
        metryki: [
          {
            serverId: 'w1',
            subscriptionId: 's1',
            bucketStart: new Date(),
            cpuUsageMax: 1,
            memUsageMaxMb: 512,
            diskUsageMb: 100,
          },
        ],
      }),
    );
    await expect(s.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('pyta o metryki tylko z okna świeżości', async () => {
    const prisma = fakePrisma({
      servers: [wezel({ overcommitRam: 4 })],
      liczbaKont: { w1: 1 },
      metryki: [],
    });
    const s = new NodeSelectorService(prisma);
    await s.pickServerForPlan(PLAN).catch(() => undefined);

    const wywolanie = (prisma as unknown as {
      usageMetric: { findMany: jest.Mock };
    }).usageMetric.findMany.mock.calls[0]![0];
    const od = wywolanie.where.bucketStart.gte as Date;
    const minut = (Date.now() - od.getTime()) / 60_000;
    expect(minut).toBeGreaterThan(25);
    expect(minut).toBeLessThan(35);
  });
});


/**
 * OPS-01 — węzeł ACTIVE, ale milczący, nie może dostać nowego konta.
 *
 * Przyczyna: żadna ścieżka w API nigdy nie zapisywała statusu OFFLINE.
 * Watchdog liczył węzły z przeterminowanym sygnałem, metryki raportowały
 * „offline", a wiersz w bazie zostawał ACTIVE — i to po nim wybierał selektor.
 *
 * Te testy pilnują, że wybór opiera się na SYGNALE ŻYCIA, a nie na statusie.
 * Dzięki temu poprawka działa niezależnie od tego, czy kiedyś dopiszemy
 * automatyczne przejście do OFFLINE.
 */
describe('OPS-01 — martwy węzeł wypada z wyboru', () => {
  const dawno = new Date(Date.now() - 60 * 60_000);

  it('węzeł ACTIVE bez sygnału od godziny nie jest wybierany', async () => {
    const serwis = new NodeSelectorService(
      fakePrisma({ servers: [wezel({ lastHeartbeatAt: dawno })] }) as never,
    );
    await expect(serwis.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('węzeł, który nigdy się nie odezwał, nie jest wybierany', async () => {
    const serwis = new NodeSelectorService(
      fakePrisma({ servers: [wezel({ lastHeartbeatAt: null })] }) as never,
    );
    await expect(serwis.pickServerForPlan(PLAN)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('komunikat odróżnia milczące węzły od braku węzłów w ogóle', async () => {
    const serwis = new NodeSelectorService(
      fakePrisma({ servers: [wezel({ lastHeartbeatAt: dawno })] }) as never,
    );
    await expect(serwis.pickServerForPlan(PLAN)).rejects.toThrow(/sygnał życia/i);
  });

  it('spośród dwóch węzłów wybiera ten, który odpowiada', async () => {
    const serwis = new NodeSelectorService(
      fakePrisma({
        servers: [
          wezel({ id: 'martwy', lastHeartbeatAt: dawno }),
          wezel({ id: 'zywy', lastHeartbeatAt: new Date() }),
        ],
      }) as never,
    );
    const wybrany = await serwis.pickServerForPlan(PLAN);
    expect(wybrany.id).toBe('zywy');
  });

  it('kontrola strażnika — żywy węzeł nadal przechodzi', async () => {
    // Bez tej asercji poprzednie testy przeszłyby także wtedy, gdyby selektor
    // po prostu odrzucał wszystko.
    const serwis = new NodeSelectorService(
      fakePrisma({ servers: [wezel({ id: 'zywy' })] }) as never,
    );
    await expect(serwis.pickServerForPlan(PLAN)).resolves.toMatchObject({ id: 'zywy' });
  });
});

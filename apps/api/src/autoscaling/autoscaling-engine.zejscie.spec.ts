import { AutoscalingEngineService } from './autoscaling-engine.service.js';

/**
 * Zejście z autoskalowania przy realnym rytmie telemetrii.
 *
 * Agent węzła (verris-lve, co minutę) wysyła kubełek POPRZEDNIEJ minuty, a API wyrównuje bucketStart
 * w dół do pełnej minuty. W chwili ticku silnika (pełna minuta) najnowszy kubełek ma ok. 2 min.
 * Na żywo 09.10 (d3): +50% CPU od 13:43, zużycie 0% od 13:44, o 14:00 naliczony drugi blok — silnik
 * nie zszedł, bo okno 5 min od zegara silnika łapało 3–4 kubełki, a zejście wymaga 5.
 */
describe('AutoscalingEngineService — zejście przy realnym opóźnieniu telemetrii', () => {
  const TICK = new Date('2026-10-09T12:00:00.300Z');

  /** Kubełki co minutę; najnowszy = TICK − 2 min (tak jak przychodzą z węzła). */
  function kubelki(ile: number, cpu: number) {
    const najnowszy = Date.UTC(2026, 9, 9, 11, 58, 0);
    return Array.from({ length: ile }, (_, i) => ({
      bucketStart: new Date(najnowszy - i * 60_000),
      cpuUsageAvg: cpu,
      memUsageAvgMb: 10,
      diskUsageMb: 3291,
    }));
  }

  function silnik(wiersze: ReturnType<typeof kubelki>) {
    const prisma = {
      usageMetric: {
        findMany: vi.fn(async (args: { where: { bucketStart: { gte: Date } }; take: number }) =>
          wiersze
            .filter((w) => w.bucketStart >= args.where.bucketStart.gte)
            .sort((a, b) => b.bucketStart.getTime() - a.bucketStart.getTime())
            .slice(0, args.take),
        ),
      },
    };
    const service = new AutoscalingEngineService(
      prisma as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const applyChange = vi.fn(async () => undefined);
    (service as unknown as { applyChange: typeof applyChange }).applyChange = applyChange;
    return { service, applyChange };
  }

  const sub = {
    id: 'sub-d3',
    userId: 'u1',
    autoscalingScaleCpu: true,
    autoscalingScaleRam: true,
    autoscalingScaleDisk: true,
    account: { status: 'ACTIVE', scaledCpu: 50, scaledRamMb: 0, scaledDiskMb: 0, serverId: 'n1' },
    plan: {
      cpuLimit: 200,
      ramLimitMb: 8192,
      diskLimitMb: 51200,
      autoscalingMaxOverscaleCpu: 12,
      autoscalingMaxOverscaleRam: 4,
      autoscalingMaxOverscaleDisk: 20,
    },
    user: { walletBalance: 100, email: 'k@example.com', firstName: null },
  };

  const ocen = (service: AutoscalingEngineService) =>
    (service as unknown as { evaluate: (s: unknown, r: unknown[]) => Promise<string> }).evaluate(sub, []);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TICK);
  });
  afterEach(() => vi.useRealTimers());

  it('po 5 min bez obciążenia zdejmuje dołożone CPU (DOWN), mimo opóźnienia telemetrii', async () => {
    const { service, applyChange } = silnik(kubelki(20, 0));
    expect(await ocen(service)).toBe('DOWN');
    expect(applyChange).toHaveBeenCalledWith(
      sub,
      expect.objectContaining({ nextScaledCpu: 0, direction: 'DOWN' }),
    );
  });

  it('nie schodzi, gdy niskie zużycie trwa krócej niż 5 kubełków', async () => {
    const wiersze = [...kubelki(3, 0), ...kubelki(20, 240).slice(3)];
    const { service, applyChange } = silnik(wiersze);
    expect(await ocen(service)).toBe('HOLD');
    expect(applyChange).not.toHaveBeenCalled();
  });
});

describe('AutoscalingEngineService — brak pojemności węzła zapisywany raz na blok', () => {
  function silnik(istnieje: boolean) {
    const najnowszy = Date.UTC(2026, 9, 9, 11, 58, 0);
    const wiersze = Array.from({ length: 10 }, (_, i) => ({
      bucketStart: new Date(najnowszy - i * 60_000),
      cpuUsageAvg: 198,
      memUsageAvgMb: 10,
      diskUsageMb: 3291,
    }));
    const prisma = {
      usageMetric: { findMany: vi.fn(async () => wiersze.slice(0, 5)) },
      autoscalingEvent: {
        findFirst: vi.fn(async () => (istnieje ? { id: 'e1' } : null)),
        create: vi.fn(async () => ({})),
      },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const service = new AutoscalingEngineService(
      prisma as never,
      audit as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    (service as unknown as { ogranicznikPojemnosciWezla: unknown }).ogranicznikPojemnosciWezla = vi.fn(async () => ({
      serverId: 'n1',
      przyznane: { cpu: 0, ramMb: 0, diskMb: 0 },
      obciete: true,
      telemetriaSwieza: true,
    }));
    return { service, prisma, audit };
  }

  const sub = {
    id: 'sub-d3',
    userId: 'u1',
    autoscalingScaleCpu: true,
    autoscalingScaleRam: true,
    autoscalingScaleDisk: true,
    account: { status: 'ACTIVE', scaledCpu: 0, scaledRamMb: 0, scaledDiskMb: 0, serverId: 'n1' },
    plan: {
      cpuLimit: 200,
      ramLimitMb: 8192,
      diskLimitMb: 51200,
      autoscalingMaxOverscaleCpu: 12,
      autoscalingMaxOverscaleRam: 4,
      autoscalingMaxOverscaleDisk: 20,
    },
    user: { walletBalance: 100, email: 'k@example.com', firstName: null },
  };
  const ocen = (service: AutoscalingEngineService) =>
    (service as unknown as { evaluate: (s: unknown, r: unknown[]) => Promise<string> }).evaluate(sub, []);

  it('pierwszy tick bez pojemności zapisuje zdarzenie i wpis w dzienniku', async () => {
    const { service, prisma, audit } = silnik(false);
    expect(await ocen(service)).toBe('HOLD');
    expect(prisma.autoscalingEvent.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('kolejny tick w tym samym bloku nie dopisuje nic', async () => {
    const { service, prisma, audit } = silnik(true);
    expect(await ocen(service)).toBe('HOLD');
    expect(prisma.autoscalingEvent.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

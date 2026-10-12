import { AutoscalingEngineService } from './autoscaling-engine.service.js';

/**
 * K3 (PB-53.5) — autoskalowanie liczy bazę dysku z limitu TEJ usługi (plan albo limit indywidualny). Przed K3 silnik
 * brał `plan.diskLimitMb`: przy limicie indywidualnym 100 GB i planie 50 GB pierwszy ruch autoskalowania zapisywał
 * na serwerze quota = 50 GB + nadwyżka, czyli zdejmował limit ustawiony przez administratora. applyChange liczy
 * quota i księgę z `plan` przekazanego do evaluate — wystarczy, że silnik dostaje plan z nadpisaniami.
 */
describe('AutoscalingEngineService — limity indywidualne', () => {
  const PLAN = {
    cpuLimit: 200,
    ramLimitMb: 8192,
    diskLimitMb: 51200,
    includedTransferGb: null,
    ioLimitKbps: 10240,
    iopsLimit: 1024,
    entryProcesses: 40,
    nprocLimit: 20,
    autoscalingMaxOverscaleCpu: 3,
    autoscalingMaxOverscaleRam: 3,
    autoscalingMaxOverscaleDisk: 3,
  };

  function silnik(limitOverrides: unknown) {
    const sub = {
      id: 's1',
      userId: 'u1',
      limitOverrides,
      autoscalingScaleCpu: true,
      autoscalingScaleRam: true,
      autoscalingScaleDisk: true,
      account: { id: 'a1', status: 'ACTIVE', scaledCpu: 0, scaledRamMb: 0, scaledDiskMb: 0, serverId: 'n1', daUsername: 'klient1' },
      plan: PLAN,
      user: { walletBalance: 100, email: 'k@example.com', firstName: null },
    };
    const prisma = { subscription: { findMany: vi.fn(async () => [sub]) }, autoscalingPriceRule: { findMany: vi.fn(async () => []) } };
    const service = new AutoscalingEngineService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
    const evaluate = vi.fn(async () => 'HOLD');
    (service as unknown as { evaluate: typeof evaluate }).evaluate = evaluate;
    return { service, evaluate };
  }

  it('silnik dostaje plan z bazą dysku z limitu indywidualnego', async () => {
    const { service, evaluate } = silnik({ diskLimitMb: 102400, emailAccounts: 100 });
    await service.tick();
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ plan: expect.objectContaining({ diskLimitMb: 102400, cpuLimit: 200 }) }), []);
  });

  it('bez limitów indywidualnych — plan bez zmian', async () => {
    const { service, evaluate } = silnik(null);
    await service.tick();
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ plan: PLAN }), []);
  });
});

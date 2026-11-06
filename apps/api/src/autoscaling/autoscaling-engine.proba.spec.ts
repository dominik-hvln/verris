import { AutoscalingEngineService } from './autoscaling-engine.service.js';

/** 1.11 — usługa w okresie próbnym nie dostaje dodatkowej mocy: silnik w ogóle jej nie bierze pod uwagę. */
describe('Silnik autoskalowania – okres próbny', () => {
  it('tick pomija usługi z isTrial = true', async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { subscription: { findMany }, autoscalingPriceRule: { findMany: vi.fn(async () => []) } };
    const svc = new AutoscalingEngineService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
    await svc.tick().catch(() => undefined);
    expect(findMany).toHaveBeenCalled();
    expect((findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject({ isTrial: false, autoscalingEnabled: true });
  });
});

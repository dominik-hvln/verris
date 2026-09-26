import { ServiceHealthService } from './service-health.service.js';

/** Stary wynik zdrowia od razu, nowy w tle — strona usługi nie czeka na sondy. */
function setup(snapshot: Record<string, unknown> | null) {
  const prisma = {
    subscription: {
      findFirst: vi.fn().mockResolvedValue({ id: 's1', healthSnapshots: snapshot ? [snapshot] : [] }),
    },
  };
  const svc = new (ServiceHealthService as unknown as new (...a: unknown[]) => ServiceHealthService)(prisma, {});
  const compute = vi.spyOn(svc, 'computeAndPersist').mockImplementation(() => new Promise(() => undefined));
  const fromSnap = vi.spyOn(svc as unknown as { fromSnapshot: (s: unknown) => unknown }, 'fromSnapshot').mockReturnValue({ score: 70 });
  return { svc, compute, fromSnap };
}
const old = { computedAt: new Date(Date.now() - 2 * 3_600_000), score: 70 };

describe('zdrowie usługi — stale-while-revalidate', () => {
  it('nieaktualny wynik wraca od razu, a liczenie rusza w tle (raz)', async () => {
    const { svc, compute } = setup(old);
    await expect(svc.getOrRefreshForSubscription('s1', 'u1')).resolves.toEqual({ score: 70 });
    await svc.getOrRefreshForSubscription('s1', 'u1');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('„Odśwież” (force) czeka na nowy wynik', async () => {
    const { svc, compute } = setup(old);
    compute.mockResolvedValue({ score: 90 } as never);
    await expect(svc.getOrRefreshForSubscription('s1', 'u1', { force: true })).resolves.toEqual({ score: 90 });
  });

  it('brak jakiegokolwiek wyniku — liczymy od razu', async () => {
    const { svc, compute } = setup(null);
    compute.mockResolvedValue({ score: 50 } as never);
    await expect(svc.getOrRefreshForSubscription('s1', 'u1')).resolves.toEqual({ score: 50 });
  });
});

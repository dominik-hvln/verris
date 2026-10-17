import { NodeTasksService, STALE_RUNNING_MS } from './node-tasks.service.js';

/** 17.10 (PB-31): Onboard LIVE świeżego węzła trwa ponad 75 min — z heartbeatem nie może być oznaczony FAILED. */
it('twardy limit RUNNING ≥ limitu jednostki zadania na węźle (TimeoutStartSec=7200)', async () => {
  expect(STALE_RUNNING_MS).toBeGreaterThanOrEqual(7200 * 1000);
  const findMany = vi.fn(async () => []);
  const svc = Object.create(NodeTasksService.prototype) as NodeTasksService;
  Object.assign(svc, { prisma: { nodeTask: { findMany } } });
  const przed = Date.now();
  await (svc as unknown as { reclaimStaleRunningTasks: (id: string) => Promise<void> }).reclaimStaleRunningTasks('s1');
  const where = (findMany.mock.calls[0] as unknown as [{ where: { OR: Array<{ startedAt?: { lt: Date } }> } }])[0].where;
  const odciecie = where.OR[0]!.startedAt!.lt.getTime();
  // zadanie z heartbeatem sprzed minuty i startem sprzed 80 min nie łapie się na twardy limit
  expect(przed - 80 * 60 * 1000).toBeGreaterThan(odciecie);
});

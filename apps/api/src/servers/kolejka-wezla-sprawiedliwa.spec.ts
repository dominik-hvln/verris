import { NodeTasksService } from './node-tasks.service.js';

/**
 * Audyt bezpieczeństwa 13.10: kolejka zadań węzła była czystym FIFO — jedno konto z dziesiątkami zadań opóźniało
 * innych klientów i operatora o kilkadziesiąt minut.
 */
describe('Kolejka zadań węzła — sprawiedliwe wydawanie', () => {
  type T = { id: string; accountId: string | null; createdAt: Date; requestedBy?: { role: string } | null; startedAt?: Date | null };
  function stanowisko(kolejka: T[], obsluzone: Array<{ accountId: string; startedAt: Date }> = []) {
    const prisma = {
      nodeTask: {
        updateMany: vi.fn(async () => ({ count: 0 })), // reclaim + claim (claim zwraca 0 → lease null; liczy się wybór)
        findMany: vi.fn(async () => [...kolejka].sort((a, b) => +a.createdAt - +b.createdAt)),
        findFirst: vi.fn(async () => [...kolejka].sort((a, b) => +a.createdAt - +b.createdAt)[0] ?? null),
        groupBy: vi.fn(async (a: { where: { accountId: { in: string[] } } }) =>
          a.where.accountId.in.map((id) => ({ accountId: id, _max: { startedAt: obsluzone.find((o) => o.accountId === id)?.startedAt ?? null } })),
        ),
      },
    };
    const svc = Object.create(NodeTasksService.prototype) as NodeTasksService;
    Object.assign(svc, { prisma, reclaimStaleRunningTasks: vi.fn(async () => undefined) });
    const wybrane = async () => {
      await svc.leaseTaskForNode('srv');
      const claim = prisma.nodeTask.updateMany.mock.calls.at(-1) as unknown as [{ where: { id: string } }];
      return claim[0].where.id;
    };
    return { wybrane };
  }
  const t = (id: string, accountId: string | null, min: number, role?: string): T => ({
    id, accountId, createdAt: new Date(Date.UTC(2026, 9, 13, 20, min)), requestedBy: role ? { role } : null,
  });

  it('zadanie operatora wyprzedza starsze zadania klientów', async () => {
    const s = stanowisko([t('k1', 'A', 0), t('k2', 'A', 1), t('op', 'B', 5, 'STAFF')]);
    expect(await s.wybrane()).toBe('op');
  });

  it('zadanie całego węzła (bez konta) wyprzedza klientów', async () => {
    const s = stanowisko([t('k1', 'A', 0), t('wezel', null, 9)]);
    expect(await s.wybrane()).toBe('wezel');
  });

  it('konto, które właśnie było obsłużone, przepuszcza inne konto (nawet z nowszym zadaniem)', async () => {
    const s = stanowisko(
      [t('a1', 'A', 0), t('a2', 'A', 1), t('a3', 'A', 2), t('b1', 'B', 30)],
      [{ accountId: 'A', startedAt: new Date(Date.UTC(2026, 9, 13, 21, 0)) }],
    );
    expect(await s.wybrane()).toBe('b1');
  });

  it('w ramach jednego konta — najstarsze', async () => {
    const s = stanowisko([t('a2', 'A', 1), t('a1', 'A', 0)]);
    expect(await s.wybrane()).toBe('a1');
  });
});

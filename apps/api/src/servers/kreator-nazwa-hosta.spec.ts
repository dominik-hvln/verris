import { ServersService } from './servers.service.js';

/** PB-31 (17.10): drugi węzeł z tą samą nazwą hosta po zamknięciu karty kreatora. */
function serwis(istniejacy: { id: string; status: string } | null) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'nowy', ...data }));
  const prisma = { server: { findFirst: vi.fn(async () => istniejacy), create } };
  const s = new ServersService(
    prisma as never, { generateRandomToken: () => 'abc' } as never, { record: vi.fn(async () => undefined) } as never,
    { issue: vi.fn(async () => ({ plaintext: 't', token: { id: 'tk', expiresAt: new Date() } })) } as never,
    null as never, null as never, null as never, null as never, null as never,
  );
  return { s, create, prisma };
}

it('nazwa hosta zajęta przez niedokończony węzeł → 409 z adresem kreatora, bez nowego węzła', async () => {
  const { s, create } = serwis({ id: 'eb9a', status: 'PENDING_APPROVAL' });
  await expect(s.initServer({ name: 'TEST-02', hostname: 'T2.verris.pl' } as never, 'u1')).rejects.toThrow(/wizard\?server=eb9a/);
  expect(create).not.toHaveBeenCalled();
});

it('nazwa wolna (albo tylko u wycofanego węzła) → węzeł powstaje', async () => {
  const { s, create, prisma } = serwis(null);
  await s.initServer({ name: 'TEST-02', hostname: 't2.verris.pl' } as never, 'u1');
  expect(create).toHaveBeenCalledTimes(1);
  expect(prisma.server.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ status: { not: 'DEPROVISIONING' } }) }),
  );
});

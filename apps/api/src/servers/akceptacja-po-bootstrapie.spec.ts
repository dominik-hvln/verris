import { ServersService } from './servers.service.js';

/** PB-31 (17.10): akceptacja węzła była możliwa już po handshake (faza AGENT), w trakcie CANARY i TLS. */
function serwis(bootstrapPhase: string | null) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', hostname: 'n1.verris.pl', name: 'n1', ...data }));
  const prisma = {
    server: {
      findUnique: vi.fn(async () => ({ id: 's1', status: 'PENDING_APPROVAL', hostname: 'n1.verris.pl', name: 'n1', bootstrapPhase })),
      update,
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const nodeDns = { tryAutoProvision: vi.fn(async () => undefined) };
  const nodeTasks = { queueHostingProfile: vi.fn(async () => undefined), queueOnboardLive: vi.fn(async () => undefined) };
  const s = new ServersService(
    prisma as never, null as never, audit as never, null as never, null as never, null as never, null as never,
    nodeDns as never, nodeTasks as never,
  );
  // hook wildcard TLS nie jest tu przedmiotem testu
  (s as unknown as { requestWildcardTlsDeploy: () => Promise<void> }).requestWildcardTlsDeploy = async () => undefined;
  return { s, update, nodeTasks };
}

describe('akceptacja węzła dopiero po DONE bootstrapu', () => {
  it.each(['AGENT', 'CANARY', 'TLS'])('faza %s — odmowa, status bez zmian, bez zadań na węźle', async (faza) => {
    const { s, update, nodeTasks } = serwis(faza);
    await expect(s.approveServer('s1', 'u1')).rejects.toThrow(/faza|Gotowe/);
    expect(update).not.toHaveBeenCalled();
    expect(nodeTasks.queueHostingProfile).not.toHaveBeenCalled();
  });

  it.each(['DONE', null])('faza %s (null = węzeł bez bootstrapu v2) — akceptacja przechodzi', async (faza) => {
    const { s, update } = serwis(faza);
    await expect(s.approveServer('s1', 'u1')).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

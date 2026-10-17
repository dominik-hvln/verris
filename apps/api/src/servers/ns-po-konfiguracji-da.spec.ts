import { ServersService } from './servers.service.js';

/** 17.10 (PB-31): NS z bootstrapu nie trafiały do DA (przy CANARY nie ma jeszcze klucza DA), a zapis klucza ich nie nakładał. */
function serwis(wezel: Record<string, unknown>) {
  const prisma = {
    server: {
      findUnique: vi.fn(async () => ({ id: 's1', daUseTls: true, daAllowInvalidCert: false })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', ...wezel, ...data })),
    },
  };
  const nodeDns = { zastosujNsWDirectAdmin: vi.fn(async () => []) };
  const s = new ServersService(
    prisma as never, { encrypt: (v: string) => `enc:${v}` } as never, { record: vi.fn(async () => undefined) } as never,
    null as never, null as never, null as never, null as never, nodeDns as never, null as never,
  );
  return { s, nodeDns };
}
const dto = { daHost: 't2.verris.pl', daPort: 2222, daUsername: 'admin', daPassword: 'klucz' };

it('zapis klucza DA na węźle z NS → NS nakładane w DA', async () => {
  const { s, nodeDns } = serwis({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' });
  await s.setDirectAdminConfig('s1', dto as never, 'u1');
  expect(nodeDns.zastosujNsWDirectAdmin).toHaveBeenCalledWith('s1');
});

it('węzeł bez NS → bez wywołania', async () => {
  const { s, nodeDns } = serwis({ ns1: null, ns2: null });
  await s.setDirectAdminConfig('s1', dto as never, 'u1');
  expect(nodeDns.zastosujNsWDirectAdmin).not.toHaveBeenCalled();
});

import { NodeBootstrapService } from './node-bootstrap.service.js';

/**
 * 17.10 (PB-31): NS glue i rekord A nazwy hosta zakładane tylko przy CANARY STARTED, a wynik zawsze jako „OK”
 * (także przy błędach OVH i bez OVH). Faza TLS czekała potem 15 min na rekord, którego nie było, a ponowienie
 * fazy TLS niczego już nie zakładało.
 */
function serwis(o: { skonfigurowane?: boolean; ok?: boolean; nsProvisionedAt?: Date | null; rzuca?: boolean } = {}) {
  const zdarzenia: Array<{ phase: string; status: string; message: string }> = [];
  const prisma = {
    nodeBootstrapEvent: { create: vi.fn(async ({ data }: { data: (typeof zdarzenia)[number] }) => zdarzenia.push(data)) },
    server: {
      findUnique: vi.fn(async () => ({ id: 's1', bootstrapStartedAt: new Date(), nsProvisionedAt: o.nsProvisionedAt ?? null })),
      update: vi.fn(async () => ({})),
    },
  };
  const nodeDns = {
    isConfigured: () => o.skonfigurowane ?? true,
    provisionNodeNameservers: vi.fn(async () => {
      if (o.rzuca) throw new Error('OVH 403');
      return {
        ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl', ok: o.ok ?? true,
        steps: o.ok === false ? [{ step: 'Glue ns1.verris.pl', status: 'error', detail: 'This call has not been granted' }] : [],
      };
    }),
  };
  const s = new NodeBootstrapService(prisma as never, null as never, { get: () => undefined } as never, nodeDns as never);
  return { s, zdarzenia, nodeDns };
}

describe('bootstrap — DNS węzła w OVH przy CANARY i TLS', () => {
  it('błędy kroków OVH → zdarzenie FAILED z krokami, nie „OK”', async () => {
    const { s, zdarzenia } = serwis({ ok: false });
    await s.provisionNsBestEffort('s1', 'CANARY');
    expect(zdarzenia).toEqual([expect.objectContaining({ phase: 'CANARY', status: 'FAILED', message: expect.stringContaining('Glue ns1.verris.pl') })]);
  });

  it('wyjątek OVH i brak konfiguracji OVH → zdarzenie FAILED (dotąd tylko log)', async () => {
    const a = serwis({ rzuca: true });
    await a.s.provisionNsBestEffort('s1', 'CANARY');
    expect(a.zdarzenia[0]).toMatchObject({ status: 'FAILED', message: expect.stringContaining('OVH 403') });
    const b = serwis({ skonfigurowane: false });
    await b.s.provisionNsBestEffort('s1', 'CANARY');
    expect(b.zdarzenia[0]).toMatchObject({ status: 'FAILED', message: expect.stringContaining('ręcznie') });
    expect(b.nodeDns.provisionNodeNameservers).not.toHaveBeenCalled();
  });

  it('raport TLS STARTED ponawia DNS, gdy wcześniej się nie udało; po udanym (nsProvisionedAt) — nie', async () => {
    const a = serwis({ nsProvisionedAt: null });
    await a.s.recordReport({ serverId: 's1', phase: 'TLS', status: 'STARTED' });
    await vi.waitFor(() => expect(a.nodeDns.provisionNodeNameservers).toHaveBeenCalledTimes(1));
    const b = serwis({ nsProvisionedAt: new Date() });
    await b.s.recordReport({ serverId: 's1', phase: 'TLS', status: 'STARTED' });
    await new Promise((r) => setTimeout(r, 10));
    expect(b.nodeDns.provisionNodeNameservers).not.toHaveBeenCalled();
  });
});

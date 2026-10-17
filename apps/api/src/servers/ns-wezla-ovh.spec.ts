import { NodeDnsService } from './node-dns.service.js';

/**
 * 17.10 (PB-31): provisionNodeNameservers ustawiało nsProvisionedAt także przy błędach OVH (np. glue bez uprawnień
 * klucza) — tryAutoProvision przy akceptacji i ponowienie przy fazie TLS uznawały węzeł za gotowy. Węzeł bez IPv6
 * zostawiał stary AAAA nazwy hosta i NS (reinstalacja na tym samym IP).
 */
function serwis(o: { glueBlad?: boolean; staryAAAA?: boolean; usunGlueBlad?: boolean } = {}) {
  const wywolania: string[] = [];
  const ovh = {
    isConfigured: () => true,
    request: vi.fn(async (metoda: string, sciezka: string) => {
      wywolania.push(`${metoda} ${sciezka}`);
      if (metoda === 'GET' && sciezka.includes('/record?fieldType=AAAA')) return o.staryAAAA ? [77] : [];
      if (metoda === 'GET' && sciezka.includes('/record?')) return [];
      if (metoda === 'GET' && sciezka.includes('/glueRecord/')) throw new Error('404');
      if (metoda === 'POST' && sciezka.endsWith('/glueRecord') && o.glueBlad) throw new Error('This call has not been granted');
      if (metoda === 'DELETE' && sciezka.includes('/glueRecord/') && o.usunGlueBlad) throw new Error('500');
      return {};
    }),
  };
  const update = vi.fn(async () => ({}));
  const prisma = {
    server: {
      findUnique: vi.fn(async () => ({ id: 's1', ipAddress: '62.171.162.57', ipv6Address: null, hostname: 't2.verris.pl', ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' })),
      findMany: vi.fn(async () => []),
      update,
    },
  };
  const da = { applyBrandedNameserversOnNode: vi.fn(async () => ({ adminSettings: 'skipped', nameServerDefaults: 'skipped', hostingAccounts: { updated: 0, skipped: 0, failed: 0 } })) };
  const s = new NodeDnsService(prisma as never, ovh as never, { record: vi.fn(async () => undefined) } as never, { get: () => undefined } as never, da as never);
  return { s, update, wywolania };
}

describe('NS węzła w OVH', () => {
  it('błąd glue → nsProvisionedAt nie jest ustawiane (ponowienie przy TLS/akceptacji ma sens)', async () => {
    const { s, update } = serwis({ glueBlad: true });
    const r = await s.provisionNodeNameservers('s1', { ipv6: null });
    expect(r.ok).toBe(false);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nsProvisionedAt: null }) }));
  });

  it('bez błędów → nsProvisionedAt ustawione', async () => {
    const { s, update } = serwis();
    await s.provisionNodeNameservers('s1', { ipv6: null });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nsProvisionedAt: expect.any(Date) }) }));
  });

  it('węzeł bez IPv6: stare AAAA nazwy hosta i NS są usuwane', async () => {
    const { s, wywolania } = serwis({ staryAAAA: true });
    await s.provisionNodeNameservers('s1', { ipv6: null });
    expect(wywolania.filter((w) => w === 'DELETE /domain/zone/verris.pl/record/77')).toHaveLength(3);
  });

  it('wycofanie: błąd usuwania glue → ns1/ns2 zostają przy węźle', async () => {
    const { s, update } = serwis({ usunGlueBlad: true });
    const kroki = await s.zwolnijNazwyWezla('s1');
    expect(kroki.some((k) => k.status === 'error')).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});

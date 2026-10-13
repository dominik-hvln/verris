import * as tls from 'tls';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { DomainsService, probeTls, normalizujNazweDomeny } from './domains.service.js';

vi.mock('tls', async (orig) => {
  const m = await orig<typeof import('tls')>();
  return { ...m, connect: vi.fn(m.connect) };
});

/**
 * Audyt bezpieczeństwa 13.10 (niskie):
 *  - literał IP jako nazwa domeny omijał ochronę SSRF sondy TLS (Node nie woła lookup dla adresu IP),
 *  - niezweryfikowana, darmowa rezerwacja sufiksu („com.pl”) albo cudzej domeny-rodzica blokowała bez końca
 *    innym klientom domeny dodatkowe i aliasy (Z-10 uznawał każdy wpis Domain za dowód własności).
 */
describe('Domeny — rezerwacje i sonda TLS', () => {
  const DZIEN = 86400000;
  type Wiersz = { id: string; name: string; userId: string; status: string; registrarProvider: string | null; createdAt: Date };

  // Minimalny ewaluator `where` Prismy użytego w Z-10 (name in, userId not, OR [...]).
  type Where = {
    name?: string | { in: string[] };
    userId?: { not: string };
    status?: string;
    registrarProvider?: { not: null };
    createdAt?: { gte: Date };
    OR?: Where[];
  };
  function pasuje(w: Wiersz, where: Where): boolean {
    if (typeof where.name === 'object' && !where.name.in.includes(w.name)) return false;
    if (typeof where.name === 'string' && where.name !== w.name) return false;
    if (where.userId?.not && w.userId === where.userId.not) return false;
    if (where.status && w.status !== where.status) return false;
    if (where.registrarProvider && 'not' in where.registrarProvider && w.registrarProvider === where.registrarProvider.not) return false;
    if (where.createdAt?.gte && w.createdAt < where.createdAt.gte) return false;
    if (where.OR && !where.OR.some((c) => pasuje(w, c))) return false;
    return true;
  }

  function da(wiersze: Wiersz[]) {
    const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    const post = vi.fn(async () => ({ data: 'error=0&text=OK' }));
    Object.assign(klient, { client: { get: vi.fn(async () => ({ data: 'list0=firma.pl' })), post } });
    const account = { id: 'a1', status: 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
      account: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), update: vi.fn(async () => account) },
      domain: { findFirst: vi.fn(async (a: { where: Where }) => wiersze.find((w) => pasuje(w, a.where)) ?? null) },
    };
    const svc = new DirectAdminService(prisma as never, {} as never, { getPhpSlotReleases: async () => ['8.3'] } as never, { record: vi.fn() } as never);
    vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
    return { svc, post };
  }
  const wiersz = (o: Partial<Wiersz>): Wiersz => ({ id: 'd', name: 'x.pl', userId: 'u2', status: 'PENDING', registrarProvider: null, createdAt: new Date(), ...o });

  it('Z-10: niezweryfikowana rezerwacja sufiksu albo domeny-rodzica innego klienta nie blokuje domeny dodatkowej', async () => {
    const s = da([wiersz({ name: 'com.pl' }), wiersz({ name: 'sklep.pl', createdAt: new Date(Date.now() - 2 * DZIEN) })]);
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'moja.com.pl' })).resolves.toBeTruthy();
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'outlet.sklep.pl' })).resolves.toBeTruthy();
  });

  it('Z-10: domena aktywna, z rejestracji albo świeża rezerwacja tej samej nazwy nadal blokuje', async () => {
    const s = da([
      wiersz({ name: 'aktywna.pl', status: 'ACTIVE' }),
      wiersz({ name: 'kupiona.pl', registrarProvider: 'openprovider' }),
      wiersz({ name: 'swieza.pl' }),
    ]);
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'sklep.aktywna.pl' })).rejects.toThrow('innym koncie');
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'kupiona.pl' })).rejects.toThrow('innym koncie');
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'swieza.pl' })).rejects.toThrow('innym koncie');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('dodanie domeny: IP i sam sufiks → 400, nazwa trafia do bazy małymi literami', async () => {
    const prisma = {
      account: { findFirst: vi.fn(async () => null) },
      domain: { findUnique: vi.fn(async () => null), create: vi.fn(async (a: { data: { name: string } }) => a.data) },
    };
    const svc = new DomainsService(prisma as never, {} as never);
    for (const zla of ['127.0.0.1', '10.0.0.5', '[::1]', 'com.pl', 'PL', 'bez-kropki', 'zła nazwa.pl']) {
      await expect(svc.create('u1', { name: zla })).rejects.toThrow();
    }
    await expect(svc.create('u1', { name: ' MojaFirma.PL. ' })).resolves.toMatchObject({ name: 'mojafirma.pl' });
    expect(normalizujNazweDomeny('żółw.pl')).toBe('żółw.pl');
  });

  it('sonda TLS: adres prywatny wpisany jako nazwa → bez połączenia', async () => {
    const r = await probeTls('127.0.0.1');
    expect(r.ok).toBe(false);
    expect(vi.mocked(tls.connect)).not.toHaveBeenCalled();
  });
});

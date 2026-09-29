import { BadRequestException } from '@nestjs/common';
import { AppInstallService } from './app-install.service.js';

/**
 * I-01 — instalator aplikacji na wybranej domenie usługi (retest D3 29.09: tylko domena główna,
 * zajęta przez WordPressa, więc instalator był bezużyteczny). Cudza domena odpada PRZED bazą.
 */
function stanowisko(domenyUslugi: string[]) {
  const account = { id: 'a1', domain: 'firma.pl', daUsername: 'klient1', serverId: 's1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 'sub1', account })) },
    nodeTask: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async (a: unknown) => ({ id: 't1', ...(a as object) })) },
  };
  const client = { createMysqlDatabase: vi.fn(async () => ({ database: 'klient1_mediab', username: 'klient1_mediab' })) };
  const da = {
    getClientForHostingAccount: vi.fn(async () => client),
    listHostingDomainsForSubscription: vi.fn(async () => ({ domains: domenyUslugi.map((name) => ({ name })) })),
    assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => {
      if (!domenyUslugi.includes(d.trim().toLowerCase())) throw new BadRequestException('Ta domena nie należy do tej usługi.');
      return d.trim().toLowerCase();
    }),
  };
  const svc = new AppInstallService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never);
  const wejscie = { app: 'mediawiki', adminUser: 'admin', adminEmail: 'admin@firma.pl' };
  return { svc, prisma, client, wejscie };
}

describe('AppInstallService — domena instalacji', () => {
  it('druga domena usługi → zadanie i adres panelu na tej domenie', async () => {
    const s = stanowisko(['firma.pl', 'wiki.pl']);
    const r = await s.svc.install('sub1', 'u1', { ...s.wejscie, domain: 'Wiki.pl' });
    expect(r.domain).toBe('wiki.pl');
    expect(r.adminUrl).toBe('https://wiki.pl/');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ domain: 'wiki.pl' }) }) }));
  });

  it('domena spoza usługi → odmowa bez zakładania bazy', async () => {
    const s = stanowisko(['firma.pl']);
    await expect(s.svc.install('sub1', 'u1', { ...s.wejscie, domain: 'cudza.pl' })).rejects.toThrow('nie należy');
    expect(s.client.createMysqlDatabase).not.toHaveBeenCalled();
  });

  it('bez domeny → główna; status podaje listę domen usługi', async () => {
    const s = stanowisko(['firma.pl', 'wiki.pl']);
    expect((await s.svc.install('sub1', 'u1', s.wejscie)).domain).toBe('firma.pl');
    expect((await s.svc.statusForSubscription('sub1', 'u1')).domains).toEqual(['firma.pl', 'wiki.pl']);
  });
});

import { BadRequestException } from '@nestjs/common';
import { WordpressService } from './wordpress.service.js';

/**
 * Instalacja WordPressa na wybranej domenie usługi (test D3 29.09: szedł zawsze na domenę główną, więc
 * przy drugiej domenie nie dało się go postawić z panelu). Cudza domena odpada PRZED założeniem bazy.
 */
function stanowisko(domenyUslugi: string[], ostatnie: Record<string, unknown> | null = null) {
  const account = { id: 'a1', domain: 'firma.pl', daUsername: 'klient1', serverId: 's1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 'sub1', account })) },
    nodeTask: {
      findFirst: vi.fn(async (a: { where: { status?: unknown } }) => (a.where.status ? null : ostatnie)),
      create: vi.fn(async (a: unknown) => ({ id: 't1', ...(a as object) })),
    },
  };
  const client = { createMysqlDatabase: vi.fn(async () => ({ database: 'klient1_wpab12', username: 'klient1_wpab12' })) };
  const da = {
    getClientForHostingAccount: vi.fn(async () => client),
    witrynyKonta: vi.fn(async () => ({ witryny: domenyUslugi.map((nazwa) => ({ nazwa })), fetchError: null })),
    witrynaKonta: vi.fn(async (_s: string, _u: string, d: string) => {
      if (!domenyUslugi.includes(d.trim().toLowerCase())) throw new BadRequestException('Ta domena nie należy do tej usługi.');
      return { nazwa: d.trim().toLowerCase() };
    }),
  };
  const svc = new WordpressService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never);
  const wejscie = { siteTitle: '', adminUser: 'admin', adminEmail: 'admin@firma.pl' };
  return { svc, prisma, client, wejscie };
}

describe('WordpressService — domena instalacji', () => {
  it('druga domena usługi → zadanie, tytuł i adres wp-admin na tej domenie', async () => {
    const s = stanowisko(['firma.pl', 'sklep.pl']);
    const r = await s.svc.install('sub1', 'u1', { ...s.wejscie, domain: 'Sklep.pl' });
    expect(r.domain).toBe('sklep.pl');
    expect(r.adminUrl).toBe('https://sklep.pl/wp-admin');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ payload: expect.objectContaining({ domain: 'sklep.pl', siteTitle: 'sklep.pl' }) }),
    }));
  });

  it('poddomena konta (próba bety 06.10) → instalacja na niej', async () => {
    const s = stanowisko(['firma.pl', 'sklep.firma.pl']);
    const r = await s.svc.install('sub1', 'u1', { ...s.wejscie, domain: 'sklep.firma.pl' });
    expect(r.adminUrl).toBe('https://sklep.firma.pl/wp-admin');
    expect((await s.svc.statusForSubscription('sub1', 'u1')).domains).toContain('sklep.firma.pl');
  });

  it('domena spoza usługi → odmowa bez zakładania bazy', async () => {
    const s = stanowisko(['firma.pl']);
    await expect(s.svc.install('sub1', 'u1', { ...s.wejscie, domain: 'cudza.pl' })).rejects.toThrow('nie należy');
    expect(s.client.createMysqlDatabase).not.toHaveBeenCalled();
  });

  it('bez domeny → główna; status podaje listę domen i domenę ostatniej instalacji', async () => {
    const s = stanowisko(['firma.pl', 'sklep.pl'], {
      id: 't0', status: 'COMPLETED', payload: { domain: 'sklep.pl' }, errorMessage: null, outputLog: null,
      createdAt: new Date('2026-09-29T10:00:00Z'), completedAt: null,
    });
    expect((await s.svc.install('sub1', 'u1', s.wejscie)).domain).toBe('firma.pl');
    const st = await s.svc.statusForSubscription('sub1', 'u1');
    expect(st.domains).toEqual(['firma.pl', 'sklep.pl']);
    expect(st.task?.domain).toBe('sklep.pl');
  });
});

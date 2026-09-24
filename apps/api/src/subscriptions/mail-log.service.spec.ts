import { MailLogService, wpisyPocztyZLogu } from './mail-log.service';

/**
 * E-19 — skrypt węzła sprawdzony lokalnie na próbce logu exima: wiadomość „nasza”, gdy nadawca
 * albo odbiorca w domenach konta — wtedy wszystkie jej wiersze (np. dostarczenie do gmail.com);
 * cudza poczta z tego samego logu nie wychodzi.
 */
function stanowisko() {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const da = { listHostingDomainsForSubscription: jest.fn(async () => ({ domains: [{ name: 'Sklep.pl' }, { name: 'sklep.pl' }, { name: 'blog.pl' }] })) };
  return { svc: new MailLogService(prisma as never, da as never), prisma };
}

describe('MailLogService', () => {
  it('domeny konta z DirectAdmina (bez duplikatów), adres zawężający', async () => {
    const s = stanowisko();
    await s.svc.zlec('s1', 'u1', ' Jan@Sklep.pl ');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'MAIL_LOG', payload: { domains: 'sklep.pl,blog.pl', address: 'jan@sklep.pl' } }),
    });
  });

  it('wpisy z logu', () => {
    expect(wpisyPocztyZLogu('VERRIS_ML 2026-09-24 11:00:00|1tA2c1-000AbE-Dg|**|zly@x.pl|550 5.1.1 User unknown\nVERRIS_ML_RAZEM 1')).toEqual([
      { czas: '2026-09-24 11:00:00', id: '1tA2c1-000AbE-Dg', znak: '**', adres: 'zly@x.pl', szczegoly: '550 5.1.1 User unknown' },
    ]);
  });
});

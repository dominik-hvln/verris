import { BadRequestException } from '@nestjs/common';
import { SiteCloneService } from './site-clone.service.js';

/**
 * I-13 — skrypt węzła sprawdzony lokalnie: cel odkładany obok (unikalna nazwa, mv -T), WordPress bez
 * nowej bazy → odmowa przed ruszeniem celu, nowa baza w wp-config.php kopii, zamiana adresów.
 */
function stanowisko(wp: boolean) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const klient = { createMysqlDatabase: vi.fn(async (o: { name: string }) => ({ database: `klient1_${o.name}`, username: `klient1_${o.name}` })) };
  const da = {
    assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d.toLowerCase()),
    getClientForHostingAccount: vi.fn(async () => klient),
  };
  const wpSvc = { status: vi.fn(async () => ({ stan: wp ? { version: '6.6' } : null })) };
  return { svc: new SiteCloneService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never, wpSvc as never), prisma, klient };
}

describe('SiteCloneService', () => {
  it('WordPress: nowa baza w DirectAdminie i jej dane w zadaniu', async () => {
    const s = stanowisko(true);
    await s.svc.klonuj('s1', 'u1', { source: 'a.pl', target: 'B.pl' });
    expect(s.klient.createMysqlDatabase).toHaveBeenCalled();
    const d = (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { kind: string; payload: Record<string, string> } }])[0].data;
    expect(d.kind).toBe('SITE_CLONE');
    expect(d.payload).toMatchObject({ source: 'a.pl', target: 'b.pl', dbName: expect.stringMatching(/^klient1_kl[0-9a-f]{6}$/) });
    expect(d.payload.dbPass).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('bez WordPressa bez bazy; ta sama domena → 400', async () => {
    const s = stanowisko(false);
    await s.svc.klonuj('s1', 'u1', { source: 'a.pl', target: 'b.pl' });
    expect(s.klient.createMysqlDatabase).not.toHaveBeenCalled();
    await expect(s.svc.klonuj('s1', 'u1', { source: 'a.pl', target: 'A.pl' })).rejects.toThrow(BadRequestException);
  });
});

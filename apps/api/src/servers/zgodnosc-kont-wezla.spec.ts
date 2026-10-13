import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service.js';
import { ServersAdminController } from './servers.admin.controller.js';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';

/** H-16 (13.10): sierota rdeetgju na t1/t2 dalej serwowała strefę DNS — panel nie pokazywał kont DA bez usługi. */
describe('Zgodność kont węzła z panelem', () => {
  function stanowisko(naWezle: string[], wPanelu: Array<{ id: string; daUsername: string; domain: string }>, gdzieIndziej: Array<{ daUsername: string; serverId: string; server: { name: string } }> = []) {
    const prisma = {
      server: { findUnique: vi.fn(async () => ({ daUsername: 'admin' })) },
      account: {
        findMany: vi.fn(async (a: { where: { serverId?: string; daUsername?: { in: string[] } } }) =>
          a.where.serverId ? wPanelu : gdzieIndziej.filter((g) => a.where.daUsername!.in.includes(g.daUsername)),
        ),
      },
    };
    const svc = new DirectAdminService(prisma as never, {} as never, {} as never, { record: vi.fn() } as never);
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue({ listAccounts: async () => naWezle } as never);
    return svc;
  }

  it('sierota po przeniesieniu (konto panelu na innym węźle), sierota bez śladu i konto panelu, którego nie ma w DA', async () => {
    const svc = stanowisko(
      ['admin', 'ovsekucx', 'rdeetgju', 'xyz123'],
      [{ id: 'a1', daUsername: 'ovsekucx', domain: 'd3.hvln.pl' }, { id: 'a2', daUsername: 'zgubione', domain: 'z.pl' }],
      [{ daUsername: 'rdeetgju', serverId: 't1', server: { name: 'TEST-NRB-01' } }],
    );
    const w = await svc.zgodnoscKontWezla('t2');
    expect(w.sieroty).toEqual([
      { daUsername: 'rdeetgju', gdzieIndziej: { serverId: 't1', serverName: 'TEST-NRB-01' } },
      { daUsername: 'xyz123', gdzieIndziej: null },
    ]);
    expect(w.brakujace).toEqual([{ daUsername: 'zgubione', domain: 'z.pl', accountId: 'a2' }]);
  });

  it('trasa tylko do odczytu z NODES_VIEW', () => {
    expect(Reflect.getMetadata(STAFF_PERMISSIONS_KEY, ServersAdminController.prototype.zgodnoscKont)).toEqual(['NODES_VIEW']);
  });

  // Przegląd paczki 42: błąd DA (error=1) albo strona HTML dawały pustą listę → fałszywe „brak w DirectAdmin”.
  it.each([['error=1&text=Access%20denied'], ['<html><body>Login</body></html>']])('odpowiedź DA %s → wyjątek, nie pusta lista', async (body) => {
    const prisma = { server: { findUnique: vi.fn(async () => ({ daUsername: 'admin' })) }, account: { findMany: vi.fn(async () => []) } };
    const svc = new DirectAdminService(prisma as never, {} as never, {} as never, { record: vi.fn() } as never);
    const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });
    Object.assign(klient, { client: { get: vi.fn(async () => ({ data: body })) } });
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue(klient);
    await expect(svc.zgodnoscKontWezla('t1')).rejects.toThrow();
  });
});

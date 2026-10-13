import { DirectAdminService } from './directadmin.service.js';
import { NodeTasksService } from './node-tasks.service.js';

/**
 * H-16 — porządek po przeniesieniu konta na inny węzeł (decyzja Dominika 14.10). 13.10 te kroki robił ręcznie:
 * NS w strefie rodzica (d3.hvln.pl → pb55), usunięcie sieroty rdeetgju na starym węźle.
 */
describe('Przeniesienie konta — delegacja NS w strefie rodzica', () => {
  type R = { id: string; name: string; type: string; value: string; ttl: number | null };
  function stanowisko(o: { rodzicNaWezle: string }) {
    let strefa: R[] = [
      { id: '1', name: 'd3.hvln.pl.', type: 'NS', value: 'ns3.verris.pl.', ttl: 3600 },
      { id: '2', name: 'pb55', type: 'NS', value: 'ns3.verris.pl.', ttl: 3600 },
      { id: '3', name: 'pb55', type: 'NS', value: 'ns4.verris.pl.', ttl: 3600 },
      { id: '4', name: 'pb55', type: 'DS', value: '31655 13 2 abc', ttl: 3600 },
    ];
    const prisma = {
      account: {
        findUnique: vi.fn(async () => ({ id: 'a-pb55', userId: 'u2', subscriptionId: 's-pb55', serverId: 't2', domain: 'pb55.d3.hvln.pl' })),
        findMany: vi.fn(async () => [{ domain: 'd3.hvln.pl', userId: 'u1', subscriptionId: 's-d3', serverId: o.rodzicNaWezle }]),
      },
      server: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 't1' ? { ns1: 'ns3.verris.pl', ns2: 'ns4.verris.pl' } : { ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' },
        ),
      },
    };
    const audit = { record: vi.fn() };
    const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);
    vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [{ name: 'pb55.d3.hvln.pl' }], primaryDomain: 'pb55.d3.hvln.pl', daUsername: 'rdeetgju', fetchError: null });
    vi.spyOn(svc, 'listHostingDnsRecords').mockImplementation(async (sub, _u, d) => {
      expect(sub).toBe('s-d3');
      return { domain: d ?? null, records: strefa, fetchError: null };
    });
    const dodaj = vi.spyOn(svc, 'createHostingDnsRecord').mockImplementation(async (_s, _u, r) => {
      strefa = [...strefa, { id: 'n', name: r.name, type: r.type, value: r.value, ttl: 3600 }];
      return { ok: true as const };
    });
    const usun = vi.spyOn(svc, 'deleteHostingDnsRecord').mockImplementation(async (_s, _u, r) => {
      strefa = strefa.filter((z) => !(z.type === r.type && z.value === r.value && z.name === r.name));
      return { ok: true as const };
    });
    return { svc, dodaj, usun, audit, delegacja: () => strefa.filter((r) => r.name === 'pb55').map((r) => `${r.type} ${r.value}`).sort() };
  }

  it('t1 → t2: NS pb55 w strefie d3 przechodzą z ns3/ns4 na ns1/ns2, DS zostaje; rodzic na starym węźle', async () => {
    const t = stanowisko({ rodzicNaWezle: 't1' });
    const w = await t.svc.przepnijDelegacjePoPrzeniesieniu('a-pb55', 't1');
    expect(t.delegacja()).toEqual(['DS 31655 13 2 abc', 'NS ns1.verris.pl.', 'NS ns2.verris.pl.']);
    expect(w).toEqual({ przepiete: ['pb55.d3.hvln.pl'], rodzicNaStarymWezle: true, bledy: [] });
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DNS_DELEGATION_MOVED' }));
    // Kolejność: najpierw dodanie, potem usunięcie (strefa nigdy bez delegacji).
    expect(t.dodaj.mock.invocationCallOrder[1]).toBeLessThan(t.usun.mock.invocationCallOrder[0]);
  });

  it('rodzic na innym węźle niż stary → rodzicNaStarymWezle=false', async () => {
    const t = stanowisko({ rodzicNaWezle: 't3' });
    expect((await t.svc.przepnijDelegacjePoPrzeniesieniu('a-pb55', 't1')).rodzicNaStarymWezle).toBe(false);
  });
});

describe('Przeniesienie konta — sierota na starym węźle', () => {
  function zadania(payload: Record<string, string>, o: { serverId?: string; status?: string } = {}) {
    const task = { id: 't-arch', serverId: 't1', status: o.status ?? 'RUNNING', kind: 'OFFSITE_RESTORE', accountId: 'a-pb55', payload, requestedById: null, createdAt: new Date(), updatedAt: new Date(), startedAt: new Date(), completedAt: null as Date | null };
    const prisma = {
      nodeTask: {
        findUnique: vi.fn(async () => task),
        findMany: vi.fn(async () => [task]),
        update: vi.fn(async (a: { data: { payload?: unknown } }) => {
          if (a.data.payload) task.payload = a.data.payload as Record<string, string>;
          return task;
        }),
        create: vi.fn(async (a: unknown) => a),
      },
      account: { findUnique: vi.fn(async () => ({ serverId: o.serverId ?? 't2', daUsername: 'rdeetgju', status: 'ACTIVE' })) },
      server: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) },
    };
    const stary = { suspendAccount: vi.fn(async () => ({})), deleteAccount: vi.fn(async () => ({})) };
    const nowy = { listAccounts: vi.fn(async () => ['ovsekucx', 'rdeetgju']) };
    const da = {
      getClientForServer: vi.fn(async (id: string) => (id === 't1' ? stary : nowy)),
      przepnijDelegacjePoPrzeniesieniu: vi.fn(async () => ({ przepiete: ['pb55.d3.hvln.pl'], rodzicNaStarymWezle: payload.rodzicNaStarym === '1', bledy: [] })),
    };
    const audit = { record: vi.fn() };
    const alarmy = { wyslij: vi.fn(async () => undefined) };
    const svc = new NodeTasksService(prisma as never, audit as never, da as never, undefined, undefined, undefined, alarmy as never);
    return { svc, prisma, stary, nowy, audit, alarmy, task };
  }
  const LOG = 'VERRIS-ORPHAN-ARCHIVED rdeetgju /root/verris-sieroty/20261014-100000-user.admin.rdeetgju.tar.zst';

  it('po przepięciu: zadanie archiwum na starym węźle z informacją o strefie rodzica', async () => {
    const t = zadania({ rodzicNaStarym: '1' });
    await t.svc.porzadekPoPrzeniesieniu('a-pb55', 't1', 'rdeetgju');
    expect(t.prisma.nodeTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serverId: 't1', accountId: 'a-pb55', kind: 'OFFSITE_RESTORE',
        payload: { mode: 'archiwum', daUser: 'rdeetgju', przeniesienie: '1', sierota: '1', rodzicNaStarym: '1' },
      }),
    });
  });

  it('archiwum gotowe, rodzic gdzie indziej → zawieszenie, usunięcie dopiero za dobę', async () => {
    const t = zadania({ mode: 'archiwum', daUser: 'rdeetgju', przeniesienie: '1', sierota: '1', rodzicNaStarym: '0' });
    await t.svc.completeTaskFromNode({ serverId: 't1', taskId: 't-arch', outputLog: LOG });
    expect(t.stary.suspendAccount).toHaveBeenCalledWith('rdeetgju');
    expect(t.stary.deleteAccount).not.toHaveBeenCalled();
    expect(t.task.payload).toMatchObject({ stanSieroty: 'zawieszona', archiwum: '/root/verris-sieroty/20261014-100000-user.admin.rdeetgju.tar.zst' });

    // Przed upływem doby — nic; po dobie — usunięcie, bo konto jest na nowym węźle.
    t.task.status = 'COMPLETED';
    expect(await t.svc.sprzatnijSieroty(new Date())).toBe(0);
    expect(await t.svc.sprzatnijSieroty(new Date(Date.now() + 25 * 3600 * 1000))).toBe(1);
    expect(t.stary.deleteAccount).toHaveBeenCalledWith('rdeetgju');
    expect(t.task.payload).toMatchObject({ stanSieroty: 'usunieta' });
  });

  it('archiwum gotowe, strefa rodzica na starym węźle → zawieszenie i usunięcie od razu', async () => {
    const t = zadania({ mode: 'archiwum', daUser: 'rdeetgju', przeniesienie: '1', sierota: '1', rodzicNaStarym: '1' });
    await t.svc.completeTaskFromNode({ serverId: 't1', taskId: 't-arch', outputLog: LOG });
    expect(t.stary.suspendAccount).toHaveBeenCalled();
    expect(t.stary.deleteAccount).toHaveBeenCalledWith('rdeetgju');
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_ORPHAN_REMOVED' }));
  });

  it('bez znacznika archiwum (backup padł) → sierota nietknięta', async () => {
    const t = zadania({ mode: 'archiwum', daUser: 'rdeetgju', przeniesienie: '1', sierota: '1', rodzicNaStarym: '1' });
    await t.svc.completeTaskFromNode({ serverId: 't1', taskId: 't-arch', outputLog: '[FAIL] admin-backup rdeetgju nie powiódł się' });
    expect(t.stary.suspendAccount).not.toHaveBeenCalled();
    expect(t.stary.deleteAccount).not.toHaveBeenCalled();
  });

  it('konto wróciło na stary węzeł → to nie sierota, nic nie zawieszamy', async () => {
    const t = zadania({ mode: 'archiwum', daUser: 'rdeetgju', przeniesienie: '1', sierota: '1', rodzicNaStarym: '1' }, { serverId: 't1' });
    await t.svc.completeTaskFromNode({ serverId: 't1', taskId: 't-arch', outputLog: LOG });
    expect(t.stary.suspendAccount).not.toHaveBeenCalled();
    expect(t.task.payload).toMatchObject({ stanSieroty: 'pominieta' });
  });

  it('po dobie, ale konta nie ma na nowym węźle → bez usunięcia, alarm', async () => {
    const t = zadania({ mode: 'archiwum', daUser: 'rdeetgju', sierota: '1', stanSieroty: 'zawieszona', usunPo: new Date(Date.now() - 1000).toISOString() }, { status: 'COMPLETED' });
    t.nowy.listAccounts.mockResolvedValue(['ovsekucx']);
    expect(await t.svc.sprzatnijSieroty()).toBe(0);
    expect(t.stary.deleteAccount).not.toHaveBeenCalled();
    expect(t.alarmy.wyslij).toHaveBeenCalled();
  });
});

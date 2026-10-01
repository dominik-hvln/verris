import { StagingService } from './staging.service.js';

/**
 * I-11 — pierwsze utworzenie kopii roboczej po nieudanej próbie (retest D3 29.09): baza stgXXXX
 * z poprzedniej próby nie może zostać na koncie jako sierota; cudze bazy zostają nietknięte.
 */
describe('StagingService.createOrRefresh — sprzątanie bazy z nieudanej próby', () => {
  it('usuwa tylko <login>_stgXXXX, potem zakłada nową bazę i zadanie', async () => {
    const account = { id: 'a1', domain: 'firma.pl', daUsername: 'klient1', serverId: 's1', stagingCreatedAt: null, stagingSyncedAt: null };
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ id: 'sub1', account })) },
      nodeTask: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 't1' })) },
    };
    const client = {
      listMysqlDatabases: vi.fn(async () => ['klient1_stgab12', 'klient1_sklep', 'klient1_stgab12x', 'inny_stgab12']),
      deleteMysqlDatabase: vi.fn(async () => undefined),
      createMysqlDatabase: vi.fn(async () => ({ database: 'klient1_stgcd34', username: 'klient1_stgcd34' })),
    };
    const da = {
      listHostingStaging: vi.fn(async () => ({ rows: [] })),
      createHostingStaging: vi.fn(async () => ({})),
      getClientForHostingAccount: vi.fn(async () => client),
    };
    const svc = new StagingService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never);

    await svc.createOrRefresh('sub1', 'u1');

    expect(client.deleteMysqlDatabase.mock.calls).toEqual([['klient1_stgab12']]);
    expect(client.createMysqlDatabase).toHaveBeenCalledTimes(1);
    expect(prisma.nodeTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ payload: expect.objectContaining({ direction: 'TO_STAGING', dbName: 'klient1_stgcd34' }) }),
    }));
  });

  it('subdomena z poprzedniej próby już jest — nie zakłada jej drugi raz, tylko kolejkuje kopiowanie', async () => {
    const account = { id: 'a1', domain: 'firma.pl', daUsername: 'klient1', serverId: 's1', stagingCreatedAt: null, stagingSyncedAt: null };
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ id: 'sub1', account })) },
      nodeTask: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 't1' })) },
    };
    const client = {
      listMysqlDatabases: vi.fn(async () => []),
      deleteMysqlDatabase: vi.fn(async () => undefined),
      createMysqlDatabase: vi.fn(async () => ({ database: 'klient1_stgcd34', username: 'klient1_stgcd34' })),
    };
    const da = {
      listHostingStaging: vi.fn(async () => ({ rows: [{ id: 'staging.firma.pl', subdomain: 'staging', domain: 'firma.pl' }] })),
      createHostingStaging: vi.fn(async () => {
        throw new Error('Nie można utworzyć subdomeny: Subdomena już istnieje');
      }),
      getClientForHostingAccount: vi.fn(async () => client),
    };
    const svc = new StagingService(prisma as never, { record: vi.fn(async () => undefined) } as never, da as never);

    await svc.createOrRefresh('sub1', 'u1');

    expect(da.createHostingStaging).not.toHaveBeenCalled();
    expect(prisma.nodeTask.create).toHaveBeenCalledTimes(1);
  });
});

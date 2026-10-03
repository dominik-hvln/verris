import { MigrationStatus } from '@verris/database';
import { MigrationCutoverService, tylkoPoczta } from './migration-cutover.service.js';

/**
 * Uwaga z t1 03.10: po migracji samej poczty plan kazał przełączyć rekordy A strony i NS —
 * klientowi z pocztą przeniósłby też stronę. Dla samej poczty: tylko rekordy poczty, „gotowe” po MX.
 */
const mx = vi.hoisted(() => ({ resolveMx: vi.fn(), resolve4: vi.fn() }));
vi.mock('node:dns/promises', () => mx);

const IP = '203.0.113.7';
const dnsWynik = (o: Partial<{ pointsToServer: boolean; delegatedToExpectedNs: boolean }> = {}) => ({
  domain: 'firma.pl',
  expectedIpv4: IP,
  serverName: 't1',
  expectedNameservers: ['ns1.verris.pl', 'ns2.verris.pl'],
  observedA: [],
  observedAaaa: [],
  observedWwwA: [],
  nameservers: ['ns1.obcy.pl', 'ns2.obcy.pl'],
  delegatedToExpectedNs: false,
  pointsToServer: false,
  wwwPointsToServer: null,
  status: 'fail',
  message: '',
  issues: [],
  checkedAt: '',
  ...o,
});

describe('MigrationCutoverService — sama poczta', () => {
  const zlecenie = (kinds: string[]) => ({
    id: 'm1',
    status: MigrationStatus.COMPLETED,
    cutoverAt: null,
    cutoverMode: null,
    completedAt: new Date(),
    workerJobs: kinds.map((kind) => ({ kind, status: 'COMPLETED', completedAt: new Date() })),
  });
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1' })) },
    migrationRequest: { findFirst: vi.fn(), update: vi.fn() },
    subscriptionEvent: { create: vi.fn() },
  };
  const dnsPointing = { verifyForSubscription: vi.fn() };
  const service = () => new MigrationCutoverService(prisma as never, dnsPointing as never, { record: vi.fn() } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mx.resolveMx.mockResolvedValue([{ exchange: 'mx.obcy.pl', priority: 10 }]);
    mx.resolve4.mockResolvedValue(['198.51.100.1']);
  });

  it('rozpoznaje samą pocztę po krokach', () => {
    expect(tylkoPoczta([{ kind: 'IMAP_SYNC' }])).toBe(true);
    expect(tylkoPoczta([{ kind: 'IMAP_SYNC' }, { kind: 'FILES_SFTP_RSYNC' }])).toBe(false);
    expect(tylkoPoczta([{ kind: 'MYSQL_IMPORT' }])).toBe(false);
  });

  it('plan: tylko rekordy poczty (A mail + MX), bez rekordów strony i bez zmiany NS — nawet gdy A strony wskazuje u nas', async () => {
    prisma.migrationRequest.findFirst.mockResolvedValue(zlecenie(['IMAP_SYNC']));
    dnsPointing.verifyForSubscription.mockResolvedValue(dnsWynik({ pointsToServer: true }));
    const plan = await service().plan('s1', 'u1', 'm1');
    expect(plan.status).toBe('waiting-dns');
    expect(plan.records.map((r) => `${r.type} ${r.name}`)).toEqual(['A mail.firma.pl', 'MX firma.pl']);
    expect(plan.nameserverOption).toBeNull();
    expect(plan.message).toContain('nowa poczta');
  });

  it('MX wskazuje na nasz serwer → gotowe; verify zapisuje tryb „mx”', async () => {
    prisma.migrationRequest.findFirst.mockResolvedValue(zlecenie(['IMAP_SYNC']));
    dnsPointing.verifyForSubscription.mockResolvedValue(dnsWynik());
    mx.resolve4.mockResolvedValue([IP]);
    const plan = await service().verify('s1', 'u1', 'm1');
    expect(plan.status).toBe('done');
    expect(plan.records).toEqual([]);
    expect(prisma.migrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cutoverMode: 'mx' }) }),
    );
  });

  it('A strony u nas, MX obcy → przy samej poczcie NIE oznacza przełączenia', async () => {
    prisma.migrationRequest.findFirst.mockResolvedValue(zlecenie(['IMAP_SYNC']));
    dnsPointing.verifyForSubscription.mockResolvedValue(dnsWynik({ pointsToServer: true }));
    const plan = await service().verify('s1', 'u1', 'm1');
    expect(plan.status).toBe('waiting-dns');
    expect(prisma.migrationRequest.update).not.toHaveBeenCalled();
  });

  it('migracja strony bez zmian: rekordy A strony, www, poczty i propozycja NS', async () => {
    prisma.migrationRequest.findFirst.mockResolvedValue(zlecenie(['FILES_SFTP_RSYNC', 'IMAP_SYNC']));
    dnsPointing.verifyForSubscription.mockResolvedValue(dnsWynik());
    const plan = await service().plan('s1', 'u1', 'm1');
    expect(plan.records.map((r) => `${r.type} ${r.name}`)).toEqual([
      'A firma.pl',
      'A www.firma.pl',
      'A mail.firma.pl',
      'MX firma.pl',
    ]);
    expect(plan.nameserverOption?.nameservers).toEqual(['ns1.verris.pl', 'ns2.verris.pl']);
    expect(mx.resolveMx).not.toHaveBeenCalled();
  });
});

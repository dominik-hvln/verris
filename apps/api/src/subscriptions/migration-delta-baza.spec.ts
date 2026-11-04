import { MigrationStatus, MigrationWorkerJobKind, MigrationWorkerJobStatus } from '@verris/database';
import { MigrationOrchestratorService, OKNO_KONSERWACJI_ZRODLA_MIN } from './migration-orchestrator.service.js';
import { MigrationCutoverService, ostatniaKonserwacja } from './migration-cutover.service.js';

/**
 * P2-06 (decyzja 13, 3.11.2026) — „Dograj różnice” przed przełączeniem DNS kopiowało pliki i pocztę, bez bazy:
 * zamówienia złożone w starym sklepie po pierwszej kopii nie trafiały do nowego. Teraz: MYSQL_DELTA dla każdej bazy
 * (tryb konserwacji na starej stronie na czas kopiowania), potem ponownie WP_FIXUP (kopia plików nadpisuje
 * wp-config.php danymi starej bazy), na końcu poczta. Plan przełączenia mówi o tym klientowi.
 */
const BUNDLE = {
  sourceDomain: 'sklep.pl',
  ftp: { protocol: 'ftps', host: 'ftp.stary.pl', port: 21, username: 'f', password: 'fp', remotePath: '/public_html' },
  mysql: [{ host: 'db.stary.pl', port: 3306, username: 'du', password: 'dp', database: 'sklep' }],
  imap: [{ host: 'imap.stary.pl', port: 993, username: 'biuro@sklep.pl', password: 'ip' }],
  targets: { mysql: [{ database: 'konto_sklep', username: 'konto_u', password: 'tp' }] },
};

function orkiestrator() {
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 'sub_1', account: { domain: 'sklep.pl' } })) },
    migrationRequest: { findFirst: vi.fn(), update: vi.fn((x: unknown) => x) },
    migrationWorkerJob: {
      createMany: vi.fn((x: unknown) => x),
      findMany: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(),
    },
    subscriptionEvent: { create: vi.fn((x: unknown) => x) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const crypto = { decrypt: vi.fn(() => JSON.stringify(BUNDLE)), encrypt: vi.fn() };
  const audit = { record: vi.fn() };
  const s = new MigrationOrchestratorService(prisma as never, crypto as never, audit as never, {} as never, {} as never, {} as never, null as never);
  vi.spyOn(s, 'getBundleDetailForUser').mockResolvedValue({} as never);
  return { s, prisma };
}

describe('P2-06 — delta-sync obejmuje bazę', () => {
  it('kolejka: pliki → ostatnia kopia bazy → konfiguracja strony (wp-config) → poczta', async () => {
    const { s, prisma } = orkiestrator();
    prisma.migrationRequest.findFirst.mockResolvedValue({
      id: 'mig_1',
      status: MigrationStatus.COMPLETED,
      secretsPurgedAt: null,
      sourceBundleEnc: 'x',
      workerJobs: [{ kind: MigrationWorkerJobKind.HTTP_POST_CHECK, status: MigrationWorkerJobStatus.COMPLETED, sequence: 90 }],
    });
    await s.queueDeltaSync('sub_1', 'user_1', 'mig_1');
    const jobs = (prisma.migrationWorkerJob.createMany.mock.calls[0][0] as { data: Array<{ kind: string; sequence: number; idempotencyKey: string }> }).data;
    expect(jobs.map((j) => j.kind)).toEqual(['FILES_DELTA', 'MYSQL_DELTA', 'WP_FIXUP', 'IMAP_DELTA']);
    const seq = jobs.map((j) => j.sequence);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
    expect(seq[0]).toBeGreaterThan(90);
    expect(new Set(jobs.map((j) => j.idempotencyKey)).size).toBe(jobs.length);
  });

  it('dosynchronizowanie bazy w toku blokuje kolejne', async () => {
    const { s, prisma } = orkiestrator();
    prisma.migrationRequest.findFirst.mockResolvedValue({
      id: 'mig_1',
      status: MigrationStatus.COMPLETED,
      secretsPurgedAt: null,
      sourceBundleEnc: 'x',
      workerJobs: [{ kind: MigrationWorkerJobKind.MYSQL_DELTA, status: MigrationWorkerJobStatus.RETRYING, sequence: 120 }],
    });
    await expect(s.queueDeltaSync('sub_1', 'user_1', 'mig_1')).rejects.toThrow('już w kolejce');
  });

  it('lease MYSQL_DELTA: źródło i baza docelowa jak przy imporcie, dostęp do plików (konserwacja) i okno konserwacji', async () => {
    const { s, prisma } = orkiestrator();
    prisma.migrationWorkerJob.findMany
      .mockResolvedValueOnce([{ id: 'j1', migrationRequestId: 'mig_1', sequence: 120, maxAttempts: 3, startedAt: null }])
      .mockResolvedValueOnce([{ migrationRequestId: 'mig_1', sequence: 120, status: 'QUEUED' }]);
    prisma.migrationWorkerJob.findUnique.mockResolvedValue({
      id: 'j1',
      migrationRequestId: 'mig_1',
      kind: MigrationWorkerJobKind.MYSQL_DELTA,
      attempts: 1,
      payload: { index: 0, delta: true },
      migrationRequest: {
        userId: 'user_1',
        startedAt: new Date(),
        targetDomain: 'sklep.pl',
        sourceBundleEnc: 'x',
        subscription: { account: { daUsername: 'konto', domain: 'sklep.pl' } },
      },
    });
    const job = (await s.leaseFileWorkerJobForNode('srv_1')) as Record<string, unknown>;
    expect(job).toMatchObject({
      kind: 'MYSQL_DELTA',
      delta: true,
      konserwacja: { minuty: OKNO_KONSERWACJI_ZRODLA_MIN },
      source: { database: 'sklep' },
      targetDb: { database: 'konto_sklep' },
      ftpFallback: { protocol: 'ftps', host: 'ftp.stary.pl', remotePath: '/public_html' },
      sourceDomain: 'sklep.pl',
    });
    expect(prisma.migrationRequest.update.mock.calls[0][0]).toMatchObject({ data: { currentStep: 'mysql-delta' } });
  });
});

describe('P2-06 — plan przełączenia DNS przy sklepie', () => {
  const dns = {
    domain: 'sklep.pl', expectedIpv4: '203.0.113.7', expectedNameservers: [], delegatedToExpectedNs: false, pointsToServer: false,
  };
  const godzinaTemu = new Date(Date.now() - 60 * 60_000);
  const plan = async (jobs: Array<{ kind: string; status: string; completedAt: Date | null; payload?: unknown }>) => {
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ id: 's1' })) },
      migrationRequest: {
        findFirst: vi.fn(async () => ({ id: 'm1', status: MigrationStatus.COMPLETED, cutoverAt: null, cutoverMode: null, completedAt: godzinaTemu, workerJobs: jobs })),
      },
    };
    const svc = new MigrationCutoverService(prisma as never, { verifyForSubscription: vi.fn(async () => dns) } as never, { record: vi.fn() } as never);
    return svc.plan('s1', 'u1', 'm1');
  };
  const pierwsza = [
    { kind: 'FILES_SFTP_RSYNC', status: 'COMPLETED', completedAt: godzinaTemu },
    { kind: 'MYSQL_IMPORT', status: 'COMPLETED', completedAt: godzinaTemu },
  ];

  it('sklep (jest baza): dograj różnice zalecane od razu, nie po 6 h, a tekst mówi o bazie i krótkiej przerwie', async () => {
    const p = await plan(pierwsza);
    expect(p.dosyncBazy).toBe(true);
    expect(p.deltaSyncRecommended).toBe(true);
    expect(p.message).toContain('bazę (zamówienia');
    expect(p.message).not.toContain('działa bez przerwy');
  });

  it('strona bez bazy: jak dotąd (zalecenie dopiero po 6 h)', async () => {
    const p = await plan([pierwsza[0]]);
    expect(p.dosyncBazy).toBe(false);
    expect(p.deltaSyncRecommended).toBe(false);
  });

  it('po świeżym kopiowaniu bazy: stara strona w konserwacji do …, bez ponownego zalecenia', async () => {
    const za90 = new Date(Date.now() + 90 * 60_000).toISOString();
    const p = await plan([
      ...pierwsza,
      { kind: 'MYSQL_DELTA', status: 'COMPLETED', completedAt: new Date(), payload: { integrity: { kind: 'mysql', delta: true, konserwacja: 'wlaczona', konserwacjaDo: za90 } } },
    ]);
    expect(p.konserwacjaZrodlaDo).toBe(za90);
    expect(p.deltaSyncRecommended).toBe(false);
    expect(p.konserwacjaRecznie).toBe(false);
  });

  it('okno konserwacji minęło — znowu zalecane; strona spoza WordPressa — prośba o ręczne wstrzymanie sprzedaży', async () => {
    const minelo = new Date(Date.now() - 60_000).toISOString();
    const po = await plan([
      ...pierwsza,
      { kind: 'MYSQL_DELTA', status: 'COMPLETED', completedAt: godzinaTemu, payload: { integrity: { konserwacja: 'wlaczona', konserwacjaDo: minelo } } },
    ]);
    expect(po.konserwacjaZrodlaDo).toBeNull();
    expect(po.deltaSyncRecommended).toBe(true);
    const reczna = await plan([
      ...pierwsza,
      { kind: 'MYSQL_DELTA', status: 'COMPLETED', completedAt: new Date(), payload: { integrity: { konserwacja: 'niedostepna', konserwacjaDo: null } } },
    ]);
    expect(reczna.konserwacjaRecznie).toBe(true);
  });

  it('ostatniaKonserwacja bierze najnowszy udany krok', () => {
    const k = ostatniaKonserwacja([
      { kind: 'MYSQL_DELTA', status: 'COMPLETED', completedAt: new Date(1000), payload: { integrity: { konserwacja: 'niedostepna' } } },
      { kind: 'MYSQL_DELTA', status: 'COMPLETED', completedAt: new Date(2000), payload: { integrity: { konserwacja: 'niepotwierdzona', konserwacjaDo: 'X' } } },
      { kind: 'MYSQL_DELTA', status: 'FAILED', completedAt: new Date(3000), payload: {} },
    ]);
    expect(k).toEqual({ wlaczona: true, do: 'X' });
    expect(ostatniaKonserwacja([])).toBeNull();
  });
});

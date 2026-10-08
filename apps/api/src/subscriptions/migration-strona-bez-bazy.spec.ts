import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationStatus, MigrationWorkerJobKind, MigrationWorkerJobStatus } from '@verris/database';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';
import { MigrationWorkerScheduler } from './migration-worker.scheduler.js';

/**
 * t1, 08.10 (#da592220, zakres „Pliki”): pliki WordPressa przeniesione (3864 / 109 MB), test strony dostał
 * 500 „Error establishing a database connection” — bazy nie przenosiliśmy, więc to oczekiwane — a i tak
 * eskalował zlecenie do zespołu (zgłoszenie URGENT, mail „przejął nasz zespół”). Bez bazy w zleceniu test
 * strony jest informacyjny: migracja się kończy, klient dostaje wskazówkę, zespół nic nie dostaje.
 */
function mocks(payload: Record<string, unknown>) {
  const job = {
    id: 'job_check',
    migrationRequestId: 'mig_1',
    kind: MigrationWorkerJobKind.HTTP_POST_CHECK,
    status: MigrationWorkerJobStatus.RUNNING,
    attempts: 1,
    maxAttempts: 1,
    payload,
    migrationRequest: {
      id: 'mig_1', userId: 'user_1', subscriptionId: 'sub_1', targetDomain: 'z09.example', status: MigrationStatus.RUNNING,
      subscription: { account: { serverId: 'srv_1', daUsername: 'u', domain: 'z09.example' } },
    },
  };
  const prisma = {
    migrationWorkerJob: {
      findUnique: vi.fn().mockResolvedValue(job),
      update: vi.fn().mockResolvedValue({ id: job.id }),
      count: vi.fn().mockResolvedValue(0),
    },
    migrationRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'mig_1', status: MigrationStatus.COMPLETED, subscriptionId: 'sub_1', userId: 'user_1', needsAttention: false, ticketId: null,
        targetDomain: 'z09.example', subscription: { account: { domain: 'z09.example' }, user: { id: 'user_1', email: 'k@x.pl' } },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    subscriptionEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  const tickets = { create: vi.fn().mockResolvedValue({ id: 't1' }) };
  const service = new MigrationOrchestratorService(
    prisma as never, {} as never, { record: vi.fn() } as never, { create: vi.fn() } as never, {} as never, {} as never, tickets as never,
  );
  return { service, prisma, tickets };
}

describe('test strony przy migracji bez bazy', () => {
  it('nieudany test strony bez bazy w zleceniu kończy migrację z uwagą, bez eskalacji', async () => {
    const { service, prisma, tickets } = mocks({ targetDomain: 'z09.example', bezBazy: true });
    await service.failWorkerJobFromNode({ serverId: 'srv_1', jobId: 'job_check', error: 'http check failed', log: 'HTTP 500', retryable: false });
    expect(tickets.create).not.toHaveBeenCalled();
    expect(prisma.migrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MigrationStatus.COMPLETED }) }),
    );
    expect(prisma.migrationWorkerJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ uwaga: 'strona-bez-bazy' }) }) }),
    );
  });

  it('z bazą w zleceniu nieudany test strony nadal eskaluje', async () => {
    const { service, tickets } = mocks({ targetDomain: 'z09.example' });
    await service.failWorkerJobFromNode({ serverId: 'srv_1', jobId: 'job_check', error: 'http check failed', retryable: false });
    expect(tickets.create).toHaveBeenCalled();
  });

  it('zlecenie z samymi plikami oznacza test strony jako bez bazy', () => {
    const src = readFileSync(join(import.meta.dirname, 'migration-orchestrator.service.ts'), 'utf8');
    const blok = src.slice(src.indexOf('kind: MigrationWorkerJobKind.HTTP_POST_CHECK,\n      status'), src.indexOf('return jobs;'));
    expect(blok).toMatch(/bezBazy: \(dto\.mysql\?\.length \?\? 0\) === 0/);
  });

  it('widok kroku podaje uwagę klientowi', () => {
    const svc = new MigrationOrchestratorService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const v = svc['toJobView']({
      id: 'j', kind: MigrationWorkerJobKind.HTTP_POST_CHECK, status: MigrationWorkerJobStatus.COMPLETED, sequence: 90, attempts: 1, maxAttempts: 1,
      lastError: 'http check failed', payload: { uwaga: 'strona-bez-bazy' }, lastHeartbeatAt: null, startedAt: null, completedAt: null,
    });
    expect(v.uwaga).toBe('strona-bez-bazy');
  });

  it('mail o zakończeniu mówi, że strona czeka na bazę', () => {
    const s = new MigrationWorkerScheduler({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const m = s['buildSuccessMail'](
      'k@x.pl',
      { id: 'abc', bytesTransferred: 10n, filesTransferred: 2, databasesMigrated: 0, mailboxesMigrated: 0, targetDomain: 'z09.example', subscription: { account: null } },
      null,
      true,
    );
    expect(m.text).toMatch(/bazy danych/);
  });
});

describe('postęp migracji bez kodów kroków', () => {
  it('worker nie wkłada rodzaju zadania do notatki postępu widocznej dla klienta', () => {
    const w = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts/node-migration-worker.sh'), 'utf8');
    for (const m of w.matchAll(/start_heartbeat "\$id" [^\n]*/g)) expect(m[0]).not.toMatch(/\$kind/);
  });
});

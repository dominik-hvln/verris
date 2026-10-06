import { MigrationStatus, MigrationWorkerJobStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Przegląd 28.09: „Wznów automat”, „Ponów krok” i zmiana statusu przez obsługę ustawiały RUNNING
 * zleceniu, którego kopia bezpieczeństwa konta docelowego się NIE udała — worker (rsync --delete)
 * nadpisywał stronę klienta bez kopii. Anulowanie przez obsługę nie zatrzymywało kroków w kolejce.
 */
const orkiestrator = () => {
  const p = prisma() as never;
  return new MigrationOrchestratorService(p, { decrypt: () => JSON.stringify({ ftp: { host: 'src.example', port: 22, username: 'u', password: 'p' } }), encrypt: (s: string) => s } as never, new AuditService(p), { notify: async () => undefined } as never, null as never, null as never, null as never);
};

async function zlecenie(opts: { preBackupAt: Date | null; status: MigrationStatus }) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  const req = await prisma().migrationRequest.create({
    data: {
      subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: opts.status,
      needsAttention: opts.status === MigrationStatus.ATTENTION, preBackupAt: opts.preBackupAt,
    } as never,
  });
  const job = await prisma().migrationWorkerJob.create({
    data: { migrationRequestId: req.id, kind: 'FILES_SFTP_RSYNC', status: MigrationWorkerJobStatus.FAILED, sequence: 1, idempotencyKey: `t-${req.id}` } as never,
  });
  return { req, job, serverId: wezel.id };
}

describe('Migracja — bez kopii konta docelowego nie ma workera', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('„Wznów automat” po nieudanej kopii → QUEUED (scheduler zrobi kopię), węzeł nie dostaje kroku', async () => {
    const { req, serverId } = await zlecenie({ preBackupAt: null, status: MigrationStatus.ATTENTION });
    const o = orkiestrator();
    await o.resolveAttentionForStaff({ migrationRequestId: req.id, actorUserId: req.userId, outcome: 'requeue' });
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(MigrationStatus.QUEUED);
    expect(await o.leaseFileWorkerJobForNode(serverId)).toBeNull();
  });

  it('„Ponów krok” i status RUNNING od obsługi bez kopii → QUEUED; z kopią → RUNNING i krok wydany', async () => {
    const bez = await zlecenie({ preBackupAt: null, status: MigrationStatus.FAILED });
    const o = orkiestrator();
    await o.retryWorkerJobForStaff({ migrationRequestId: bez.req.id, jobId: bez.job.id, actorUserId: bez.req.userId });
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: bez.req.id } })).status).toBe(MigrationStatus.QUEUED);
    await o.setStatusForStaff({ migrationRequestId: bez.req.id, actorUserId: bez.req.userId, status: MigrationStatus.RUNNING });
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: bez.req.id } })).status).toBe(MigrationStatus.QUEUED);
    expect(await o.leaseFileWorkerJobForNode(bez.serverId)).toBeNull();

    await wyczyscBaze();
    const z = await zlecenie({ preBackupAt: new Date(), status: MigrationStatus.FAILED });
    await o.retryWorkerJobForStaff({ migrationRequestId: z.req.id, jobId: z.job.id, actorUserId: z.req.userId });
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: z.req.id } })).status).toBe(MigrationStatus.RUNNING);
    expect(await o.leaseFileWorkerJobForNode(z.serverId)).not.toBeNull();
  });

  it('anulowanie przez obsługę zatrzymuje kroki w kolejce', async () => {
    const { req, job } = await zlecenie({ preBackupAt: new Date(), status: MigrationStatus.RUNNING });
    await prisma().migrationWorkerJob.update({ where: { id: job.id }, data: { status: MigrationWorkerJobStatus.QUEUED } });
    await orkiestrator().setStatusForStaff({ migrationRequestId: req.id, actorUserId: req.userId, status: MigrationStatus.CANCELED });
    expect((await prisma().migrationWorkerJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(MigrationWorkerJobStatus.CANCELED);
  });
});

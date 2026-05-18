import {
  MigrationStatus,
  MigrationWorkerJobKind,
  MigrationWorkerJobStatus,
} from '@verris/database';
import { MigrationOrchestratorService } from './migration-orchestrator.service';

describe('MigrationOrchestratorService', () => {
  const prisma = {
    subscription: { findFirst: jest.fn() },
    migrationRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    subscriptionEvent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace('enc:', '')),
  };
  const audit = { record: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  function service() {
    return new MigrationOrchestratorService(prisma as never, crypto as never, audit as never);
  }

  it('creates separate worker jobs for files, MySQL, IMAP and HTTP post-check', async () => {
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub_1',
      userId: 'user_1',
      account: { domain: 'target.example' },
    });
    prisma.migrationRequest.create.mockImplementation(async (args) => ({
      id: 'mig_1',
      status: MigrationStatus.QUEUED,
      currentStep: 'queued',
      targetDomain: 'target.example',
      bytesTransferred: BigInt(0),
      filesTransferred: 0,
      databasesMigrated: 0,
      mailboxesMigrated: 0,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-05-18T09:00:00.000Z'),
      updatedAt: new Date('2026-05-18T09:00:00.000Z'),
      lastError: null,
      ticketId: null,
      workerJobs: args.data.workerJobs.create.map(
        (job: { kind: MigrationWorkerJobKind }, index: number) => ({
          id: `job_${index}`,
          kind: job.kind,
        }),
      ),
    }));

    await service().createBundle('sub_1', 'user_1', {
      targetDomain: 'target.example',
      ftp: {
        protocol: 'sftp',
        host: 'old.example',
        port: 22,
        username: 'u',
        password: 'p',
        remotePath: '/',
      },
      mysql: [{ host: 'db.example', port: 3306, username: 'dbu', password: 'dbp', database: 'db1' }],
      imap: [{ host: 'imap.example', port: 993, username: 'mail@example.com', password: 'mailp' }],
    });

    const createJobs = prisma.migrationRequest.create.mock.calls[0][0].data.workerJobs.create;
    expect(createJobs.map((job: { kind: MigrationWorkerJobKind }) => job.kind)).toEqual([
      MigrationWorkerJobKind.FILES_SFTP_RSYNC,
      MigrationWorkerJobKind.MYSQL_IMPORT,
      MigrationWorkerJobKind.IMAP_SYNC,
      MigrationWorkerJobKind.HTTP_POST_CHECK,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MIGRATION_WORKER_JOB_QUEUED',
        details: expect.objectContaining({ kind: MigrationWorkerJobKind.HTTP_POST_CHECK }),
      }),
    );
  });

  it('rejects an empty migration bundle', async () => {
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub_1',
      userId: 'user_1',
      account: { domain: 'target.example' },
    });

    await expect(service().createBundle('sub_1', 'user_1', {})).rejects.toThrow(
      'Wskaż co najmniej jedno źródło',
    );
  });

  it('returns MySQL source secrets only to an authorized node lease', async () => {
    prisma.migrationRequest.findUnique.mockResolvedValue(null);
    const dbSource = { host: 'db.example', port: 3306, database: 'db1', username: 'dbu', password: 'dbp' };
    const workerJob = {
      id: 'job_1',
      migrationRequestId: 'mig_1',
      kind: MigrationWorkerJobKind.MYSQL_IMPORT,
      status: MigrationWorkerJobStatus.QUEUED,
      attempts: 0,
      payload: { index: 0 },
      migrationRequest: {
        id: 'mig_1',
        sourceBundleEnc: `enc:${JSON.stringify({ mysql: [dbSource] })}`,
        targetDomain: 'target.example',
        startedAt: null,
        userId: 'user_1',
        subscription: {
          account: { serverId: 'srv_1', daUsername: 'targetuser', domain: 'target.example' },
        },
      },
    };
    const fullPrisma = {
      ...prisma,
      migrationWorkerJob: {
        findFirst: jest.fn().mockResolvedValue(workerJob),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...workerJob,
          status: MigrationWorkerJobStatus.RUNNING,
          workerId: 'srv_1',
          attempts: 1,
        }),
      },
      migrationRequest: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const leased = await new MigrationOrchestratorService(
      fullPrisma as never,
      crypto as never,
      audit as never,
    ).leaseFileWorkerJobForNode('srv_1');

    expect(leased).toMatchObject({
      id: 'job_1',
      kind: MigrationWorkerJobKind.MYSQL_IMPORT,
      source: dbSource,
      target: { accountUsername: 'targetuser', domain: 'target.example' },
    });
    expect(fullPrisma.migrationRequest.update).toHaveBeenCalledWith({
      where: { id: 'mig_1' },
      data: expect.objectContaining({ currentStep: 'mysql' }),
    });
  });
});

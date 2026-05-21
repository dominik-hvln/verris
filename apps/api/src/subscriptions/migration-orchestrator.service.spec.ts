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

  it('keeps migration RUNNING when one worker job completes but others remain', async () => {
    const runningJob = buildWorkerJob({
      id: 'job_files',
      kind: MigrationWorkerJobKind.FILES_SFTP_RSYNC,
      status: MigrationWorkerJobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 3,
    });
    const { service, prisma } = buildWorkerLifecycleMocks(runningJob, { remainingJobs: 2 });

    await service.completeWorkerJobFromNode({
      serverId: 'srv_1',
      jobId: 'job_files',
      bytesTransferred: BigInt(1024),
      filesTransferred: 3,
    });

    expect(prisma.migrationWorkerJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_files' },
        data: expect.objectContaining({ status: MigrationWorkerJobStatus.COMPLETED }),
      }),
    );
    expect(prisma.migrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mig_1' },
        data: expect.objectContaining({
          status: MigrationStatus.RUNNING,
          completedAt: null,
        }),
      }),
    );
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'MIGRATION_WORKER_JOB_COMPLETED' }),
    });
  });

  it('marks migration COMPLETED when the last worker job finishes', async () => {
    const runningJob = buildWorkerJob({
      id: 'job_check',
      kind: MigrationWorkerJobKind.HTTP_POST_CHECK,
      status: MigrationWorkerJobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 3,
    });
    const { service, prisma } = buildWorkerLifecycleMocks(runningJob, { remainingJobs: 0 });

    await service.completeWorkerJobFromNode({
      serverId: 'srv_1',
      jobId: 'job_check',
      bytesTransferred: BigInt(0),
      filesTransferred: 0,
    });

    expect(prisma.migrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mig_1' },
        data: expect.objectContaining({
          status: MigrationStatus.COMPLETED,
          currentStep: 'done',
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'MIGRATION_BUNDLE_COMPLETED' }),
    });
  });

  it('schedules RETRYING when a worker failure is retryable', async () => {
    const runningJob = buildWorkerJob({
      id: 'job_imap',
      kind: MigrationWorkerJobKind.IMAP_SYNC,
      status: MigrationWorkerJobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 3,
    });
    const { service, prisma } = buildWorkerLifecycleMocks(runningJob);

    const result = await service.failWorkerJobFromNode({
      serverId: 'srv_1',
      jobId: 'job_imap',
      error: 'temporary imap timeout',
      retryable: true,
    });

    expect(result).toEqual({ ok: true, status: MigrationWorkerJobStatus.RETRYING });
    expect(prisma.migrationWorkerJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MigrationWorkerJobStatus.RETRYING,
          lastError: 'temporary imap timeout',
          completedAt: null,
        }),
      }),
    );
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'MIGRATION_WORKER_JOB_RETRYING' }),
    });
  });

  it('marks migration FAILED when a worker failure is not retryable', async () => {
    const runningJob = buildWorkerJob({
      id: 'job_mysql',
      kind: MigrationWorkerJobKind.MYSQL_IMPORT,
      status: MigrationWorkerJobStatus.RUNNING,
      attempts: 3,
      maxAttempts: 3,
    });
    const { service, prisma } = buildWorkerLifecycleMocks(runningJob);

    const result = await service.failWorkerJobFromNode({
      serverId: 'srv_1',
      jobId: 'job_mysql',
      error: 'invalid credentials',
      retryable: true,
    });

    expect(result).toEqual({ ok: true, status: MigrationWorkerJobStatus.FAILED });
    expect(prisma.migrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MigrationStatus.FAILED,
          lastError: 'invalid credentials',
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'MIGRATION_BUNDLE_FAILED' }),
    });
  });
});

function buildWorkerJob(overrides: {
  id: string;
  kind: MigrationWorkerJobKind;
  status: MigrationWorkerJobStatus;
  attempts: number;
  maxAttempts: number;
}) {
  return {
    id: overrides.id,
    migrationRequestId: 'mig_1',
    kind: overrides.kind,
    status: overrides.status,
    attempts: overrides.attempts,
    maxAttempts: overrides.maxAttempts,
    payload: {},
    migrationRequest: {
      id: 'mig_1',
      userId: 'user_1',
      subscriptionId: 'sub_1',
      targetDomain: 'target.example',
      sourceBundleEnc: 'enc:{}',
      subscription: {
        account: { serverId: 'srv_1', daUsername: 'targetuser', domain: 'target.example' },
      },
    },
  };
}

function buildWorkerLifecycleMocks(
  job: ReturnType<typeof buildWorkerJob>,
  opts: { remainingJobs?: number } = {},
) {
  const remainingJobs = opts.remainingJobs ?? 1;
  const prisma = {
    migrationWorkerJob: {
      findUnique: jest.fn().mockResolvedValue(job),
      update: jest.fn().mockResolvedValue({ id: job.id }),
      count: jest.fn().mockResolvedValue(remainingJobs),
    },
    migrationRequest: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          status:
            remainingJobs === 0 ? MigrationStatus.COMPLETED : MigrationStatus.RUNNING,
          subscriptionId: 'sub_1',
        }),
      update: jest.fn().mockResolvedValue({}),
    },
    subscriptionEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace('enc:', '')),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MigrationOrchestratorService(prisma as never, crypto as never, audit as never);
  return { service, prisma };
}

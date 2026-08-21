import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus, ServerStatus } from '@verris/database';
import { NodeTasksService, ALLOWED_DB_VERSIONS } from './node-tasks.service';

/**
 * REL-1 — testy nowej, wrażliwej ścieżki: zlecenie upgrade silnika MariaDB
 * (VER-UPG). Krytyczne są guardy: dozwolone wersje, stan węzła, blokada
 * downgrade'u i równoległych zleceń — bo to operacja na żywych danych klientów.
 */
describe('NodeTasksService.queueDbUpgrade', () => {
  const ACTOR = 'admin-1';
  const SRV = 'srv-1';

  function makeService(opts: {
    server?: Record<string, unknown> | null;
    inflight?: unknown;
  } = {}) {
    const server =
      opts.server === undefined
        ? {
            id: SRV,
            status: ServerStatus.ACTIVE,
            identityToken: 'hashed-token',
            dbVersion: '10.6.27',
          }
        : opts.server;

    const created = {
      id: 'task-1',
      serverId: SRV,
      kind: NodeTaskKind.DB_UPGRADE,
      status: NodeTaskStatus.QUEUED,
      payload: { version: '11.4' },
      outputLog: null,
      errorMessage: null,
      requestedById: ACTOR,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-06-24T10:00:00Z'),
      updatedAt: new Date('2026-06-24T10:00:00Z'),
    };

    const prisma = {
      server: {
        findUnique: jest.fn().mockResolvedValue(server),
        update: jest.fn().mockResolvedValue({}),
      },
      nodeTask: {
        // reclaimStaleRunningTasks → brak zawieszonych
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(opts.inflight ?? null),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const directAdmin = {};

    const service = new NodeTasksService(prisma as never, audit as never, directAdmin as never);
    return { service, prisma, audit };
  }

  it('exposes exactly the three current LTS targets', () => {
    expect(ALLOWED_DB_VERSIONS).toEqual(['11.4', '11.8', '12.3']);
  });

  it('rejects a version outside the allow-list', async () => {
    const { service, prisma } = makeService();
    await expect(service.queueDbUpgrade(SRV, ACTOR, '10.6')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.server.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFound when the server does not exist', async () => {
    const { service } = makeService({ server: null });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses upgrade on a non-ACTIVE node', async () => {
    const { service } = makeService({
      server: { id: SRV, status: ServerStatus.MAINTENANCE, identityToken: 't', dbVersion: '10.6.27' },
    });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toThrow(/ACTIVE/);
  });

  it('refuses when the node has no agent (identityToken)', async () => {
    const { service } = makeService({
      server: { id: SRV, status: ServerStatus.ACTIVE, identityToken: null, dbVersion: '10.6.27' },
    });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toThrow(/agent/i);
  });

  it('blocks a downgrade (data-loss guard)', async () => {
    const { service } = makeService({
      server: { id: SRV, status: ServerStatus.ACTIVE, identityToken: 't', dbVersion: '12.3.1' },
    });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toThrow(/downgrade/i);
  });

  it('is a no-op error when already on the target version', async () => {
    const { service } = makeService({
      server: { id: SRV, status: ServerStatus.ACTIVE, identityToken: 't', dbVersion: '11.4.2' },
    });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toThrow(/już na MariaDB/i);
  });

  it('blocks a second upgrade while one is in flight', async () => {
    const { service } = makeService({ inflight: { id: 'running-task' } });
    await expect(service.queueDbUpgrade(SRV, ACTOR, '11.4')).rejects.toThrow(/kolejce|trakcie/i);
  });

  it('queues the task, records target on the server and audits (happy path)', async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.queueDbUpgrade(SRV, ACTOR, '11.4');

    expect(prisma.nodeTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serverId: SRV,
          kind: NodeTaskKind.DB_UPGRADE,
          status: NodeTaskStatus.QUEUED,
          payload: { version: '11.4' },
          requestedById: ACTOR,
        }),
      }),
    );
    expect(prisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SRV },
        data: expect.objectContaining({ targetDbVersion: '11.4' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NODE_DB_UPGRADE_QUEUED' }),
    );
    expect(result).toEqual(expect.objectContaining({ kind: NodeTaskKind.DB_UPGRADE, status: NodeTaskStatus.QUEUED }));
  });

  it('trims and still validates whitespace-padded versions', async () => {
    const { service, prisma } = makeService();
    await service.queueDbUpgrade(SRV, ACTOR, '  11.8  ');
    expect(prisma.nodeTask.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: { version: '11.8' } }) }),
    );
  });
});

import { ForbiddenException } from '@nestjs/common';
import { CustomerPermission, Role } from '@verris/database';
import { CustomerIamService } from './customer-iam.service.js';

describe('CustomerIamService', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    customerSubaccountInvite: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
    customerMembership: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const audit = { record: vi.fn() };
  const mailer = { send: vi.fn() };
  const config = { get: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.customerMembership.findMany.mockResolvedValue([]);
    prisma.subscription.findMany.mockResolvedValue([]);
  });

  function service() {
    return new CustomerIamService(prisma as never, audit as never, mailer as never, config as never);
  }

  it('returns IAM overview only for the account owner', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner_1',
      role: Role.USER,
      customerOwnerId: null,
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'sub_1',
        email: 'ops@example.com',
        customerPermissions: [CustomerPermission.SERVICES_READ],
      },
    ]);
    prisma.customerSubaccountInvite.findMany.mockResolvedValue([]);

    await expect(service().overview('owner_1', 'owner_1')).resolves.toMatchObject({
      members: [expect.objectContaining({ id: 'sub_1' })],
      invites: [],
    });
  });

  it('rejects IAM management from a subaccount actor', async () => {
    await expect(service().overview('owner_1', 'sub_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists IAM audit entries for owner only', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner_1',
      role: Role.USER,
      customerOwnerId: null,
    });
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log_1',
        action: 'CUSTOMER_IAM_INVITE_CREATED',
        actorUserId: 'owner_1',
        details: { email: 'ops@example.com' },
        createdAt: new Date('2026-05-22T12:00:00Z'),
      },
    ]);
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'sub_1' }])
      .mockResolvedValue([{ id: 'owner_1', email: 'owner@example.com', firstName: 'Jan', lastName: 'Kowalski' }]);

    await expect(service().listAudit('owner_1', 'owner_1')).resolves.toMatchObject({
      entries: [
        expect.objectContaining({
          action: 'CUSTOMER_IAM_INVITE_CREATED',
          actor: expect.objectContaining({ email: 'owner@example.com' }),
        }),
      ],
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'owner_1',
          // O-03 — także działania subkont na koncie właściciela.
          OR: [{ action: { startsWith: 'CUSTOMER_IAM_' } }, { actorUserId: { in: ['sub_1'] } }],
        }),
      }),
    );
  });
});

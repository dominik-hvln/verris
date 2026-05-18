import { ForbiddenException } from '@nestjs/common';
import { CustomerPermission, Role } from '@verris/database';
import { CustomerIamService } from './customer-iam.service';

describe('CustomerIamService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    customerSubaccountInvite: {
      findMany: jest.fn(),
    },
  };
  const audit = { record: jest.fn() };
  const mailer = { send: jest.fn() };
  const config = { get: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

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
});

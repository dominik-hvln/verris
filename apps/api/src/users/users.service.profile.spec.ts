import { NotFoundException } from '@nestjs/common';
import { CustomerPermission } from '@verris/database';
import { UsersService } from './users.service';

describe('UsersService.getProfile (IAM)', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    subscription: { count: jest.fn() },
    referralProgramEnrollment: { findUnique: jest.fn() },
  };

  const service = new UsersService(
    prisma as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(
        service as unknown as { ensureReferralAndBadgeTokens: () => Promise<unknown> },
        'ensureReferralAndBadgeTokens',
      )
      .mockResolvedValue({
        referralCode: 'EKO-TEST',
        ecoBadgeToken: 'badge-test',
      });
  });

  it('returns principal profile for subaccount session without owner wallet', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      email: 'ops@firma.pl',
      role: 'USER',
      firstName: 'Ops',
      lastName: 'User',
      companyName: null,
      nip: null,
      address: null,
      city: null,
      postalCode: null,
      country: null,
      locale: 'pl',
      sidebarQuickLinks: [],
      walletBalance: '0',
      ecoPoints: 0,
      isTwoFactorEnabled: false,
      createdAt: new Date(),
      referredByUserId: null,
      customerOwnerId: 'owner-1',
      customerPermissions: [CustomerPermission.TICKETS_READ],
      subaccountLabel: 'support',
    });
    prisma.subscription.count.mockResolvedValue(0);
    prisma.referralProgramEnrollment.findUnique.mockResolvedValue(null);

    const profile = await service.getProfile('owner-1', 'sub-1');

    expect(profile.email).toBe('ops@firma.pl');
    expect(profile.isSubaccount).toBe(true);
    expect(profile.walletBalance).toBeNull();
    expect(profile.referralCode).toBeNull();
    expect(profile.customerPermissions).toEqual([CustomerPermission.TICKETS_READ]);
  });

  it('throws when principal user missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('owner-1', 'sub-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

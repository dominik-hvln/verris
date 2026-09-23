import { NotFoundException } from '@nestjs/common';
import { CustomerPermission } from '@verris/database';
import { UsersService } from './users.service';

describe('UsersService.getProfile (IAM)', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    subscription: { count: jest.fn() },
    referralProgramEnrollment: { findUnique: jest.fn() },
    // getProfile liczy passkeye (hasPasskey w profilu) — bez tej atrapy test
    // wywala się na `Cannot read properties of undefined (reading 'count')`,
    // co wygląda jak błąd produktu, a jest brakiem w mocku.
    webAuthnCredential: { count: jest.fn() },
  };

  const service = new UsersService(
    prisma as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
    { safeAward: jest.fn(), awardBillingProfileComplete: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.webAuthnCredential.count.mockResolvedValue(0);
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
    expect(profile.hasPasskey).toBe(false);
  });

  it('throws when principal user missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('owner-1', 'sub-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PB-16: zapisuje widok i motyw panelu — także subkontu (preferencje są osobiste)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'sub-1',
      email: 'ops@firma.pl',
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
      panelViewMode: 'simple',
      panelTheme: 'light',
    });
    (prisma.user as unknown as { update: jest.Mock }).update = update;
    prisma.user.findUnique.mockResolvedValue({
      id: 'sub-1',
      customerOwnerId: 'owner-1',
      companyName: null,
      nip: null,
      address: null,
      city: null,
      postalCode: null,
      country: null,
    });

    // PROD-02: „schowany baner” też jest osobisty — subkonto chowa go u siebie.
    const res = await service.updateProfile('owner-1', { panelViewMode: 'simple', panelTheme: 'light', onboardingHidden: true }, 'sub-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { panelViewMode: 'simple', panelTheme: 'light', onboardingHidden: true },
        select: expect.objectContaining({ onboardingHidden: true }),
      }),
    );
    expect(res.panelViewMode).toBe('simple');
    expect(res.panelTheme).toBe('light');
  });
});

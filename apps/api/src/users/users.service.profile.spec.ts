import type { Mock } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomerPermission } from '@verris/database';
import { UsersService } from './users.service.js';

describe('UsersService.getProfile (IAM)', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    subscription: { count: vi.fn() },
    referralProgramEnrollment: { findUnique: vi.fn() },
    // getProfile liczy passkeye (hasPasskey w profilu) — bez tej atrapy test
    // wywala się na `Cannot read properties of undefined (reading 'count')`,
    // co wygląda jak błąd produktu, a jest brakiem w mocku.
    webAuthnCredential: { count: vi.fn() },
    // Decyzja 09.10 — zmiana kraju/NIP sprawdza, czy była już płatność.
    walletTransaction: { count: vi.fn() },
    invoice: { count: vi.fn() },
  };

  const service = new UsersService(
    prisma as never,
    { get: vi.fn() } as never,
    {} as never,
    {} as never,
    { safeAward: vi.fn(), awardBillingProfileComplete: vi.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.webAuthnCredential.count.mockResolvedValue(0);
    prisma.walletTransaction.count.mockResolvedValue(0);
    prisma.invoice.count.mockResolvedValue(0);
    vi
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
    const update = vi.fn().mockResolvedValue({
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
    (prisma.user as unknown as { update: Mock }).update = update;
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

  it('dane do faktury: polski kod pocztowy tylko w formacie 00-000 (produkcja przyjmowała „1”)', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'u1', sidebarQuickLinks: [] });
    (prisma.user as unknown as { update: Mock }).update = update;
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', customerOwnerId: null, country: 'PL' });
    await expect(service.updateProfile('u1', { postalCode: '1' })).rejects.toThrow('00-000');
    await expect(service.updateProfile('u1', { postalCode: '62-020' })).resolves.toBeDefined();
    // Inny kraj — inny format, nie blokujemy.
    await expect(service.updateProfile('u1', { country: 'DE', postalCode: '10115' })).resolves.toBeDefined();
    expect(update).toHaveBeenCalledTimes(2);
  });
  describe('kraj rozliczenia i NIP po pierwszej płatności (decyzja 09.10)', () => {
    const klient = { id: 'u1', customerOwnerId: null, companyName: 'ACME', nip: '123 456', address: null, city: null, postalCode: null, country: 'US' };

    it('klient po płatności nie zmieni sam kraju — 403 z komunikatem po polsku, bez zapisu', async () => {
      const update = vi.fn();
      (prisma.user as unknown as { update: Mock }).update = update;
      prisma.user.findUnique.mockResolvedValue(klient);
      prisma.walletTransaction.count.mockResolvedValue(1);
      const p = service.updateProfile('u1', { country: 'CH' });
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateProfile('u1', { country: 'CH' })).rejects.toThrow('Zmianę kraju rozliczenia zgłoś obsłudze');
      expect(update).not.toHaveBeenCalled();
    });

    it('klient po opłaconej fakturze nie zmieni sam NIP', async () => {
      const update = vi.fn();
      (prisma.user as unknown as { update: Mock }).update = update;
      prisma.user.findUnique.mockResolvedValue(klient);
      prisma.invoice.count.mockResolvedValue(1);
      await expect(service.updateProfile('u1', { nip: '999' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('ponowny zapis formularza z tym samym krajem i NIP (inny zapis spacji) przechodzi po płatności', async () => {
      const update = vi.fn().mockResolvedValue({ id: 'u1', sidebarQuickLinks: [] });
      (prisma.user as unknown as { update: Mock }).update = update;
      prisma.user.findUnique.mockResolvedValue(klient);
      prisma.walletTransaction.count.mockResolvedValue(3);
      await expect(service.updateProfile('u1', { country: 'US', nip: '123-456', city: 'Austin' })).resolves.toBeDefined();
      expect(update.mock.calls[0][0].data).not.toHaveProperty('vatWeryfikacjaAt');
    });

    it('przed pierwszą płatnością klient zmienia kraj sam, a weryfikacja VAT się zeruje', async () => {
      const update = vi.fn().mockResolvedValue({ id: 'u1', sidebarQuickLinks: [] });
      (prisma.user as unknown as { update: Mock }).update = update;
      prisma.user.findUnique.mockResolvedValue(klient);
      await expect(service.updateProfile('u1', { country: 'CH' })).resolves.toBeDefined();
      expect(update.mock.calls[0][0].data).toMatchObject({
        country: 'CH', vatWeryfikacjaAt: null, vatWeryfikacjaPrzez: null, vatWeryfikacjaPodstawa: null, vatWeryfikacjaKraj: null,
      });
    });
  });
});

import { CustomerPermission } from '@verris/database';
import { UsersService } from './users.service.js';

/** P3-08 — profil subkonta niesie, czyje konto obsługuje (panel pokazuje to w pasku nad treścią). */
describe('UsersService.getProfile — kontoSubkonta (P3-08)', () => {
  const uzytkownik = (customerOwnerId: string | null) => ({
    id: customerOwnerId ? 'sub-1' : 'owner-1', email: customerOwnerId ? 'piotr@firma.pl' : 'kasia@firma.pl', role: 'USER',
    firstName: 'X', lastName: 'Y', companyName: null, nip: null, address: null, city: null, postalCode: null, country: null,
    locale: 'pl', sidebarQuickLinks: [], walletBalance: '0', ecoPoints: 0, isTwoFactorEnabled: false, createdAt: new Date(),
    referredByUserId: null, customerOwnerId, customerPermissions: [CustomerPermission.TICKETS_READ], subaccountLabel: null, subaccountServiceIds: [],
  });
  function serwis(customerOwnerId: string | null) {
    const prisma = {
      user: {
        findUnique: vi.fn(async (a: { where: { id: string } }) =>
          a.where.id === 'owner-1' && customerOwnerId
            ? { id: 'owner-1', email: 'kasia@firma.pl', companyName: 'Kasia Studio', firstName: 'Kasia', lastName: 'Pawlak', billingOutside: false }
            : uzytkownik(customerOwnerId),
        ),
      },
      subscription: { count: vi.fn(async () => 0) },
      referralProgramEnrollment: { findUnique: vi.fn(async () => null) },
      webAuthnCredential: { count: vi.fn(async () => 0) },
    };
    const s = new UsersService(prisma as never, { get: vi.fn() } as never, {} as never, {} as never, { safeAward: vi.fn() } as never, {} as never);
    vi.spyOn(s as unknown as { ensureReferralAndBadgeTokens: () => Promise<unknown> }, 'ensureReferralAndBadgeTokens').mockResolvedValue({ referralCode: null, ecoBadgeToken: null });
    return s;
  }

  it('subkonto: nazwa i adres właściciela konta', async () => {
    const p = (await serwis('owner-1').getProfile('owner-1', 'sub-1')) as { kontoSubkonta: unknown };
    expect(p.kontoSubkonta).toEqual({ ownerUserId: 'owner-1', nazwa: 'Kasia Studio', email: 'kasia@firma.pl' });
  });

  it('właściciel: brak', async () => {
    const p = (await serwis(null).getProfile('owner-1', 'owner-1')) as { kontoSubkonta: unknown };
    expect(p.kontoSubkonta).toBeNull();
  });
});

import {
  canAccessDashboardRoute,
  canShowWalletBalance,
} from './client-nav-access';

describe('client-nav-access', () => {
  const ticketsOnly = {
    isSubaccount: true,
    customerPermissions: ['TICKETS_READ'],
  };

  it('allows dashboard home and settings for ticket-only subaccount', () => {
    expect(canAccessDashboardRoute('/dashboard', ticketsOnly)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/settings', ticketsOnly)).toBe(
      true,
    );
    expect(canAccessDashboardRoute('/dashboard/support', ticketsOnly)).toBe(
      true,
    );
  });

  it('denies billing and owner-only programs', () => {
    expect(canAccessDashboardRoute('/dashboard/billing', ticketsOnly)).toBe(
      false,
    );
    expect(canAccessDashboardRoute('/dashboard/eco', ticketsOnly)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/iam', ticketsOnly)).toBe(false);
  });

  it('hides wallet for subaccount without billing permission', () => {
    expect(canShowWalletBalance(ticketsOnly)).toBe(false);
    expect(
      canShowWalletBalance({
        isSubaccount: true,
        customerPermissions: ['BILLING_READ'],
      }),
    ).toBe(true);
  });
});

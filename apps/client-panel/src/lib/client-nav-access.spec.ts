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

  it('bazy danych i instalator aplikacji tylko z uprawnieniem do plików (jak w API)', () => {
    const uslugi = { isSubaccount: true, customerPermissions: ['SERVICES_READ', 'SERVICES_MANAGE'] };
    const pliki = { isSubaccount: true, customerPermissions: ['FILES_MANAGE'] };
    for (const href of ['/dashboard/databases', '/dashboard/apps', '/dashboard/file-manager']) {
      expect(canAccessDashboardRoute(href, uslugi)).toBe(false);
      expect(canAccessDashboardRoute(href, pliki)).toBe(true);
    }
  });

  it('denies calculator for all subaccounts (owner-only tool)', () => {
    const devops = {
      isSubaccount: true,
      customerPermissions: ['SERVICES_READ', 'SERVICES_MANAGE'],
    };
    expect(canAccessDashboardRoute('/dashboard/calculator', devops)).toBe(
      false,
    );
    expect(canAccessDashboardRoute('/dashboard/services', devops)).toBe(true);
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

describe('PB-20 — zakres usług w nawigacji', () => {
  const ctx = { isSubaccount: true, customerPermissions: ['SERVICES_READ', 'FILES_MANAGE', 'BILLING_READ', 'DOMAINS_READ', 'TICKETS_READ'], serviceScope: ['s1'] };
  it('zostają ekrany usługi i pomoc, znikają zasoby całego konta — mimo uprawnień', () => {
    expect(canAccessDashboardRoute('/dashboard/services', ctx)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/file-manager', ctx)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/support', ctx)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/billing', ctx)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/domains', ctx)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/billing', { ...ctx, serviceScope: [] })).toBe(true);
  });
});

it('PB-20 — przy zakresie usług nie ma zamawiania nowych', () => {
  const ctx = { isSubaccount: true, customerPermissions: ['SERVICES_MANAGE'], serviceScope: ['s1'] };
  expect(canAccessDashboardRoute('/dashboard/services/new', ctx)).toBe(false);
  expect(canAccessDashboardRoute('/dashboard/services/new', { ...ctx, serviceScope: [] })).toBe(true);
});

describe('PB-28 — rozliczenie poza Verris', () => {
  const ctx = { isSubaccount: false, customerPermissions: null, billingOutside: true };
  it('chowa portfel, płatności i zamawianie; reszta panelu zostaje', () => {
    expect(canAccessDashboardRoute('/dashboard/billing', ctx)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/billing/invoices', ctx)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/services/new', ctx)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/services', ctx)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/autoscaling', ctx)).toBe(true);
    expect(canShowWalletBalance(ctx)).toBe(false);
  });
});

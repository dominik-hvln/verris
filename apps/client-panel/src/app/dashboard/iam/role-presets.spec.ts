import { canAccessDashboardRoute, canShowWalletBalance } from '@/lib/client-nav-access';
import { PERMISSION_LABELS } from './constants';
import { IAM_ROLE_PRESETS } from './role-presets';

/**
 * X-05 — szablony uprawnień subkonta (IAM-F.4) a to, co subkonto zobaczy.
 *
 * CO PILNUJE.
 *  - Szablon używa wyłącznie uprawnień, które zna picker (`PERMISSION_LABELS`,
 *    lustro enuma `CustomerPermission`). Literówka w szablonie to uprawnienie,
 *    którego API nie przyzna, a klient myśli, że nadał.
 *  - Szablon robi to, co obiecuje jego opis: „Księgowość" widzi płatności
 *    i saldo, „Support" widzi tickety, a ŻADEN szablon nie otwiera modułów
 *    tylko dla właściciela (IAM, EKO, polecenia, kalkulator).
 */

const ctx = (permissions: readonly string[]) => ({ isSubaccount: true, customerPermissions: [...permissions] });
const preset = (id: string) => IAM_ROLE_PRESETS.find((p) => p.id === id)!;
const OWNER_ONLY = ['/dashboard/iam', '/dashboard/eco', '/dashboard/referral', '/dashboard/calculator'];

describe('X-05 szablony ról subkont', () => {
  it('każde uprawnienie w szablonie istnieje w pickerze, bez duplikatów', () => {
    for (const p of IAM_ROLE_PRESETS) {
      expect(new Set(p.permissions).size).toBe(p.permissions.length);
      for (const perm of p.permissions) expect(PERMISSION_LABELS[perm]).toBeTruthy();
    }
  });

  it('żaden szablon nie otwiera modułów właściciela', () => {
    for (const p of IAM_ROLE_PRESETS) {
      for (const href of OWNER_ONLY) expect(canAccessDashboardRoute(href, ctx(p.permissions))).toBe(false);
    }
  });

  it('Księgowość: płatności i saldo tak, usługi nie', () => {
    const c = ctx(preset('billing').permissions);
    expect(canAccessDashboardRoute('/dashboard/billing/invoices', c)).toBe(true);
    expect(canShowWalletBalance(c)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/services', c)).toBe(false);
  });

  it('Support: tickety tak, płatności i saldo nie', () => {
    const c = ctx(preset('support').permissions);
    expect(canAccessDashboardRoute('/dashboard/support/new', c)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/billing', c)).toBe(false);
    expect(canShowWalletBalance(c)).toBe(false);
  });

  it('DevOps: usługi, DNS, poczta, pliki — bez płatności', () => {
    const c = ctx(preset('devops').permissions);
    for (const href of ['/dashboard/services/x', '/dashboard/dns', '/dashboard/email', '/dashboard/file-manager', '/dashboard/ssl']) {
      expect(canAccessDashboardRoute(href, c)).toBe(true);
    }
    expect(canAccessDashboardRoute('/dashboard/billing', c)).toBe(false);
  });

  it('Podgląd: odczyt usług, domen, ticketów i płatności — bez zarządzania plikami i DNS', () => {
    const c = ctx(preset('readonly').permissions);
    for (const href of ['/dashboard/services', '/dashboard/domains', '/dashboard/support', '/dashboard/billing']) {
      expect(canAccessDashboardRoute(href, c)).toBe(true);
    }
    for (const href of ['/dashboard/dns', '/dashboard/file-manager', '/dashboard/email']) {
      expect(canAccessDashboardRoute(href, c)).toBe(false);
    }
  });
});

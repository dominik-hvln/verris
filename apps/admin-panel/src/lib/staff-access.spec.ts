import { canAccess, type StaffAccess } from './staff-access';

/**
 * Bramkowanie nawigacji panelu admina po uprawnieniach operatora. Twarda egzekucja jest w API;
 * tu pilnujemy, żeby UI nie pokazywało operatorowi modułów spoza jego roli.
 */
describe('X-05 canAccess', () => {
  const operator = (permissions: string[]): StaffAccess => ({ role: 'STAFF', isAdmin: false, permissions });

  it('administrator ma dostęp do wszystkiego', () => {
    expect(canAccess({ role: 'ADMIN', isAdmin: true, permissions: [] }, 'BILLING_MANAGE')).toBe(true);
  });

  it('operator: tylko uprawnienia z roli', () => {
    const o = operator(['TICKETS_MANAGE', 'ABUSE_MANAGE']);
    expect(canAccess(o, 'ABUSE_MANAGE')).toBe(true);
    expect(canAccess(o, 'BILLING_MANAGE')).toBe(false);
  });

  it('element bez wymaganego uprawnienia widzi każdy operator', () => {
    expect(canAccess(operator([]), undefined)).toBe(true);
  });
});

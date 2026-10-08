import { ADMIN_ONLY, STAFF_PERMISSIONS, STAFF_PERMISSION_KEYS, isValidStaffPermission } from './staff-permissions.catalog.js';
import { ROLE_FUNKCYJNE, ROLE_SYSTEMOWE, SZCZEBLE } from './role-systemowe.js';

/**
 * PB-47 — spójność katalogu uprawnień i ról systemowych (decyzje właściciela 08.10).
 * Pilnuje, żeby nowe uprawnienie nie zostało „bezpańskie” (nikt poza ADMIN go nie dostanie) i żeby
 * role systemowe nie dawały operacji tylko-admin.
 */
const zawiera = (a: readonly string[], b: readonly string[]) => b.every((k) => a.includes(k));

describe('PB-47 — katalog uprawnień i role systemowe', () => {
  it('katalog ma nowe klucze PB-47 i nie ma duplikatów', () => {
    expect(STAFF_PERMISSION_KEYS).toEqual(expect.arrayContaining(['CUSTOMERS_INTERNAL_FLAG', 'REQUESTS_APPROVE', 'ACCOUNT_DIAGNOSTICS_VIEW']));
    expect(new Set(STAFF_PERMISSION_KEYS).size).toBe(STAFF_PERMISSION_KEYS.length);
    for (const p of STAFF_PERMISSIONS) expect(p.label.length).toBeGreaterThan(5);
  });

  it('ADMIN_ONLY to SETTINGS_MANAGE i STAFF_MANAGE — oba w katalogu', () => {
    expect([...ADMIN_ONLY].sort()).toEqual(['SETTINGS_MANAGE', 'STAFF_MANAGE']);
    for (const k of ADMIN_ONLY) expect(isValidStaffPermission(k)).toBe(true);
  });

  it('każdy klucz katalogu jest w co najmniej jednej roli systemowej albo w ADMIN_ONLY', () => {
    const uzyte = new Set([...ROLE_SYSTEMOWE.flatMap((r) => r.permissions), ...ADMIN_ONLY]);
    expect(STAFF_PERMISSION_KEYS.filter((k) => !uzyte.has(k))).toEqual([]);
  });

  it('każda rola systemowa używa wyłącznie kluczy z katalogu, bez powtórzeń', () => {
    for (const r of ROLE_SYSTEMOWE) {
      expect({ rola: r.name, obce: r.permissions.filter((k) => !isValidStaffPermission(k)) }).toEqual({ rola: r.name, obce: [] });
      expect(new Set(r.permissions).size).toBe(r.permissions.length);
    }
  });

  it('żadna rola systemowa nie ma kluczy tylko-admin', () => {
    const naruszenia = ROLE_SYSTEMOWE.flatMap((r) => r.permissions.filter((k) => ADMIN_ONLY.includes(k)).map((k) => `${r.name}: ${k}`));
    expect(naruszenia).toEqual([]);
  });

  it('szczeble L1–L4 są kumulatywne i każdy dokłada coś nowego', () => {
    expect(SZCZEBLE.map((r) => r.name)).toEqual(['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany']);
    for (let i = 1; i < SZCZEBLE.length; i++) {
      expect(zawiera(SZCZEBLE[i].permissions, SZCZEBLE[i - 1].permissions)).toBe(true);
      expect(SZCZEBLE[i].permissions.length).toBeGreaterThan(SZCZEBLE[i - 1].permissions.length);
    }
  });

  it('decyzje 08.10: kredyty/korekty (BILLING_MANAGE) dopiero od L4; L4 akceptuje wnioski i oznacza konta wewnętrzne', () => {
    const [l1, l2, l3, l4] = SZCZEBLE;
    for (const r of [l1, l2, l3]) expect(r.permissions).not.toContain('BILLING_MANAGE');
    expect(l4.permissions).toEqual(expect.arrayContaining(['BILLING_MANAGE', 'REQUESTS_APPROVE', 'CUSTOMERS_INTERNAL_FLAG']));
    expect(l1.permissions).toEqual(['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE', 'BILLING_VIEW']);
    expect(l2.permissions).toEqual(expect.arrayContaining(['ACCOUNT_DIAGNOSTICS_VIEW', 'CUSTOMERS_IMPERSONATE']));
    expect(l1.permissions).not.toContain('CUSTOMERS_IMPERSONATE');
  });

  it('role funkcyjne: komplet z decyzji, Audytor bez żadnego *_MANAGE', () => {
    expect(ROLE_FUNKCYJNE.map((r) => r.name)).toEqual([
      'Finanse i księgowość',
      'Sprzedaż i partnerzy',
      'Marketing',
      'Nadużycia i bezpieczeństwo',
      'Inżynier infrastruktury (NOC/DevOps)',
      'Inspektor ochrony danych (IOD)',
      'Audytor (tylko podgląd)',
    ]);
    const audytor = ROLE_FUNKCYJNE.find((r) => r.name.startsWith('Audytor'))!;
    expect(audytor.permissions.filter((k) => !k.endsWith('_VIEW'))).toEqual([]);
    expect(ROLE_FUNKCYJNE.find((r) => r.name === 'Marketing')!.permissions).toEqual(['DASHBOARD_VIEW', 'PROMO_MANAGE']);
  });

  it('nazwy unikalne, każda rola ma opis po polsku (1–2 zdania)', () => {
    const nazwy = ROLE_SYSTEMOWE.map((r) => r.name);
    expect(new Set(nazwy).size).toBe(nazwy.length);
    for (const r of ROLE_SYSTEMOWE) {
      const zdania = r.description.split(/[.!?](?:\s|$)/).filter((z) => z.trim()).length;
      expect({ rola: r.name, ok: zdania >= 1 && zdania <= 2 }).toEqual({ rola: r.name, ok: true });
    }
  });
});

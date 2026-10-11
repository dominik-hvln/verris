import { AuditService, type AuditCategory } from './audit.service.js';

/**
 * K6 — filtr kategorii w dzienniku bezpieczeństwa (admin /audit). Kategoria „Impersonacja” szukała prefiksu
 * IMPERSONATION_, a „Zaloguj jako klient” zapisuje USER_IMPERSONATION_STARTED / _STOPPED (users.admin.service.ts)
 * — filtr nic nie pokazywał. Ten sam błąd w „Bezpieczeństwo”: TOKEN_ zamiast API_TOKEN_CREATED / _REVOKED.
 */
type Warunek = { action?: string | { startsWith?: string; in?: string[] }; OR?: Warunek[]; AND?: Warunek[] };

/** Minimalna interpretacja `where` Prismy (tylko to, czego używa buildWhere dla `action`). */
function pasuje(w: Warunek, akcja: string): boolean {
  if (w.OR && !w.OR.some((x) => pasuje(x, akcja))) return false;
  if (w.AND && !w.AND.every((x) => pasuje(x, akcja))) return false;
  const a = w.action;
  if (typeof a === 'string') return a === akcja;
  if (a?.startsWith !== undefined && !akcja.startsWith(a.startsWith)) return false;
  if (a?.in && !a.in.includes(akcja)) return false;
  return true;
}

async function where(category: AuditCategory): Promise<Warunek> {
  const findMany = vi.fn(async () => []);
  const count = vi.fn(async () => 0);
  const svc = new AuditService({ auditLog: { findMany, count }, $transaction: async (q: Promise<unknown>[]) => Promise.all(q) } as never);
  await svc.list({ category });
  return (findMany.mock.calls[0] as unknown as [{ where: Warunek }])[0].where;
}

describe('AuditService — kategorie dziennika', () => {
  it('„Impersonacja” obejmuje START i STOP logowania jako klient, nic poza tym', async () => {
    const w = await where('IMPERSONATION');
    expect(pasuje(w, 'USER_IMPERSONATION_STARTED')).toBe(true);
    expect(pasuje(w, 'USER_IMPERSONATION_STOPPED')).toBe(true);
    expect(pasuje(w, 'PASSWORD_CHANGED')).toBe(false);
  });

  it('„Bezpieczeństwo” obejmuje tokeny API (API_TOKEN_*), dalej hasła, 2FA i blokady logowania', async () => {
    const w = await where('SECURITY');
    for (const a of ['API_TOKEN_CREATED', 'API_TOKEN_REVOKED', 'PASSWORD_CHANGED', 'TWO_FACTOR_ENABLED', 'LOGIN_BLOCKED_2FA_REQUIRED']) {
      expect([a, pasuje(w, a)]).toEqual([a, true]);
    }
    expect(pasuje(w, 'USER_IMPERSONATION_STARTED')).toBe(false);
  });

  it('kategoria ogranicza filtr akcji, nie zastępuje go', async () => {
    const findMany = vi.fn(async () => []);
    const svc = new AuditService({ auditLog: { findMany, count: vi.fn(async () => 0) }, $transaction: async (q: Promise<unknown>[]) => Promise.all(q) } as never);
    await svc.list({ category: 'IMPERSONATION', action: 'USER_IMPERSONATION_STOPPED' });
    const w = (findMany.mock.calls[0] as unknown as [{ where: Warunek }])[0].where;
    expect(pasuje(w, 'USER_IMPERSONATION_STOPPED')).toBe(true);
    expect(pasuje(w, 'USER_IMPERSONATION_STARTED')).toBe(false);
  });
});

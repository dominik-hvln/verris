import { UsersService } from './users.service.js';

/** G-18 / O-03 — dziennik aktywności: wszystkie działania HOSTING_*, z informacją, kto to zrobił. */
describe('UsersService.listMyActivity', () => {
  it('prefiks HOSTING_ bez listy; subkonto pokazane e-mailem, obsługa jako „obsługa Verris”', async () => {
    const rows = [
      { id: '1', action: 'HOSTING_WP_UPDATE_QUEUED', details: { domain: 'a.pl' }, createdAt: new Date(), actorUserId: 'sub' },
      { id: '2', action: 'HOSTING_HTACCESS_QUEUED', details: { domain: 'a.pl' }, createdAt: new Date(), actorUserId: 'staff' },
      { id: '3', action: 'HOSTING_DB_CREATED', details: { database: 'k_db' }, createdAt: new Date(), actorUserId: 'u1' },
      // Impersonacja: operator „jako klient” — actorUserId to klient, ale klient ma widzieć obsługę.
      { id: '4', action: 'HOSTING_FTP_CREATED', details: {}, createdAt: new Date(), actorUserId: 'u1', impersonatedBy: 'op-1' },
    ];
    const prisma = {
      auditLog: { findMany: vi.fn(async () => rows) },
      user: { findMany: vi.fn(async () => [{ id: 'sub', email: 'anna@firma.pl', role: 'USER' }, { id: 'staff', email: 'staff@x', role: 'STAFF' }]) },
    };
    const svc = new UsersService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    const r = await svc.listMyActivity('u1');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [expect.objectContaining({ OR: expect.arrayContaining([{ action: { startsWith: 'HOSTING_' } }]) }), { OR: [{ userId: 'u1' }, { actorUserId: 'u1' }] }] },
    }));
    expect(r.events.map((e) => e.actor)).toEqual(['anna@firma.pl', 'obsługa Verris', null, 'obsługa Verris']);
    expect(r.events[2].context).toBe('k_db');
  });
});

import { NotificationsController } from '../notifications/notifications.controller.js';
import { UsersController } from '../users/users.controller.js';
import { ConsentsController } from '../compliance/consents.controller.js';

/**
 * Audyt 13.10 (jwt.strategy.ts:subaccount-userId-owner-on-principal-routes) — dla subkonta i członka zespołu
 * `userId` to konto NADRZĘDNE. Trasy „osoby zalogowanej” (powiadomienia, historia logowań, dziennik aktywności,
 * historia zgód) przechodzą strażnika bez uprawnień, więc subkonto dostawało dane właściciela (saldo z powiadomień,
 * IP i urządzenia logowań, IP zgód) i oznaczało jego powiadomienia jako przeczytane. Teraz: osoba z sesji.
 */
const SUBKONTO = { userId: 'wlasciciel', principalUserId: 'subkonto' };
const WLASCICIEL = { userId: 'wlasciciel', principalUserId: 'wlasciciel' };

describe('Trasy osoby zalogowanej — subkonto widzi swoje, nie właściciela', () => {
  it('powiadomienia: lista, przeczytaj wszystkie, przeczytaj jedno — dla osoby z sesji', async () => {
    const svc = { listForUser: vi.fn(async () => []), markAllRead: vi.fn(async () => ({ updated: 0 })), markRead: vi.fn(async () => undefined) };
    const c = new NotificationsController(svc as never);
    await c.list(SUBKONTO);
    await c.readAll(SUBKONTO);
    await c.read(SUBKONTO, 'n1');
    expect(svc.listForUser).toHaveBeenCalledWith('subkonto', expect.anything());
    expect(svc.markAllRead).toHaveBeenCalledWith('subkonto');
    expect(svc.markRead).toHaveBeenCalledWith('subkonto', 'n1');
    await c.list(WLASCICIEL);
    expect(svc.listForUser).toHaveBeenLastCalledWith('wlasciciel', expect.anything());
  });

  it('historia logowań i dziennik aktywności — osoby z sesji', async () => {
    const svc = { listMyLoginHistory: vi.fn(async () => []), listMyActivity: vi.fn(async () => []) };
    const c = new UsersController(svc as never);
    await c.loginHistory(SUBKONTO);
    await c.activity(SUBKONTO);
    expect(svc.listMyLoginHistory).toHaveBeenCalledWith('subkonto');
    expect(svc.listMyActivity).toHaveBeenCalledWith('subkonto');
  });

  it('historia zgód — osoby z sesji', async () => {
    const svc = { listForUser: vi.fn(async () => []) };
    const c = new ConsentsController(svc as never, {} as never);
    await c.history(SUBKONTO);
    expect(svc.listForUser).toHaveBeenCalledWith('subkonto');
  });
});

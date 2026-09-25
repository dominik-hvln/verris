import { UnauthorizedException } from '@nestjs/common';
import { GrafanaAuthController } from './grafana-auth.controller';

/** Q-17 — SSO do Grafany: te same bramki sesji co panel (wylogowanie wszędzie, blokada, sesja). */
function stanowisko(payload: Record<string, unknown>, user: Record<string, unknown> | null, sesja: Record<string, unknown> | null = null) {
  const jwt = { verify: jest.fn(() => payload) };
  const prisma = {
    user: { findUnique: jest.fn(async () => user) },
    userSession: { findUnique: jest.fn(async () => sesja) },
  };
  const c = new GrafanaAuthController(jwt as never, prisma as never);
  const res = { setHeader: jest.fn() };
  const req = { headers: { authorization: 'Bearer x' }, res } as never;
  return { run: () => c.validate(req), res };
}
const admin = { id: 'a', email: 'a@v.pl', role: 'ADMIN', canAccessGrafana: true, loginBlocked: false, anonymizedAt: null, tokenVersion: 2 };

describe('GrafanaAuthController', () => {
  it('ważna sesja administratora → rola Admin i nagłówki dla proxy', async () => {
    const s = stanowisko({ sub: 'a', tv: 2 }, admin);
    await expect(s.run()).resolves.toEqual({ ok: true, role: 'Admin', email: 'a@v.pl' });
    expect(s.res.setHeader).toHaveBeenCalledWith('X-WEBAUTH-ROLE', 'Admin');
  });

  it.each([
    ['token sprzed „wyloguj wszędzie”', { sub: 'a', tv: 1 }, admin, null],
    ['konto zanonimizowane', { sub: 'a', tv: 2 }, { ...admin, anonymizedAt: new Date() }, null],
    ['operator zablokowany', { sub: 's', tv: 0 }, { ...admin, role: 'STAFF', loginBlocked: true, tokenVersion: 0 }, null],
    ['sesja urządzenia unieważniona', { sub: 'a', tv: 2, sid: 's1' }, admin, { userId: 'a', revokedAt: new Date() }],
  ])('%s → 401', async (_n, payload, user, sesja) => {
    await expect(stanowisko(payload, user, sesja).run()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

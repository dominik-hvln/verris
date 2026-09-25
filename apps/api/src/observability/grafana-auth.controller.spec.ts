import { UnauthorizedException } from '@nestjs/common';
import { GrafanaAuthController, bezpiecznaSciezka } from './grafana-auth.controller';

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

describe('Grafana SSO — bilet i sesja tylko dla hosta Grafany', () => {
  function zbuduj(user: Record<string, unknown> | null = admin) {
    const jwt = {
      verify: jest.fn((t: string) => (t === 'sesja-grafany' ? { sub: 'a', tv: 2, purpose: 'grafana' } : { sub: 'a', tv: 2 })),
      sign: jest.fn(() => 'sesja-grafany'),
    };
    const prisma = { user: { findUnique: jest.fn(async () => user) }, userSession: { findUnique: jest.fn(async () => null) } };
    return { c: new GrafanaAuthController(jwt as never, prisma as never), jwt };
  }

  it('bilet: token operatora → jednorazowy kod; kod → ciasteczko grafana_session bez Domain i przekierowanie w obrębie hosta', async () => {
    const { c, jwt } = zbuduj();
    const { code } = await c.ticket({ headers: { authorization: 'Bearer tok' } } as never);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'a', purpose: 'grafana', tv: 2 }), { expiresIn: 8 * 3600 });
    const res = { cookie: jest.fn(), redirect: jest.fn() };
    await c.sso({ res } as never, code, '/d/verris-ops');
    expect(res.cookie).toHaveBeenCalledWith('grafana_session', 'sesja-grafany', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
    expect(res.cookie.mock.calls[0][2]).not.toHaveProperty('domain');
    expect(res.redirect).toHaveBeenCalledWith(302, '/d/verris-ops');
    // Drugi raz ten sam kod nie działa.
    await expect(c.sso({ res } as never, code, '/')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bilet bez tokenu operatora albo dla konta bez dostępu → odmowa', async () => {
    await expect(zbuduj().c.ticket({ headers: {} } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(zbuduj({ ...admin, role: 'USER' }).c.ticket({ headers: { authorization: 'Bearer tok' } } as never)).rejects.toThrow('no Grafana access');
  });

  it('walidacja nie czyta już ciasteczek sesji paneli (admin_auth_token itd.), tylko grafana_session', async () => {
    const { c } = zbuduj();
    const res = { setHeader: jest.fn() };
    await expect(c.validate({ headers: { cookie: 'admin_auth_token=tok; auth_token=tok' }, res } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.validate({ headers: { cookie: 'x=1; grafana_session=sesja-grafany' }, res } as never)).resolves.toMatchObject({ role: 'Admin' });
  });

  it.each([
    ['/d/x?orgId=1', '/d/x?orgId=1'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/\t/evil.example', '/'],
    ['https://evil.example', '/'],
    [undefined, '/'],
  ])('bezpiecznaSciezka(%j) → %j', (w, o) => expect(bezpiecznaSciezka(w)).toBe(o));
});

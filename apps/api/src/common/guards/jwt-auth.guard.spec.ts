import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * 26.09 — uprawnienia subkonta muszą być sprawdzane PO zalogowaniu. Globalny strażnik widział
 * pusty req.user i przepuszczał subkonto z samym „Usługi: podgląd” do zakupu usługi.
 */
const passport = Object.getPrototypeOf(JwtAuthGuard.prototype) as InstanceType<ReturnType<typeof AuthGuard>>;

function ctx(user: unknown, method: string, path: string) {
  const req = { method, route: { path }, path, params: {}, user: undefined as unknown };
  const c = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
  vi.spyOn(passport, 'canActivate').mockImplementation(async () => {
    req.user = user;
    return true;
  });
  return c;
}

const subkonto = { userId: 'owner', principalUserId: 'sub', customerOwnerId: 'owner', customerPermissions: ['SERVICES_READ'], serviceScope: [] };
const guard = () => new JwtAuthGuard({ getAllAndOverride: () => undefined } as unknown as Reflector);

describe('JwtAuthGuard — uprawnienia subkonta po zalogowaniu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('subkonto z samym podglądem usług nie kupi usługi', async () => {
    expect(await guard().canActivate(ctx(subkonto, 'POST', '/subscriptions'))).toBe(false);
  });

  it('subkonto widzi listę usług', async () => {
    expect(await guard().canActivate(ctx(subkonto, 'GET', '/subscriptions'))).toBe(true);
  });

  it('właściciel konta przechodzi', async () => {
    expect(await guard().canActivate(ctx({ userId: 'owner', customerOwnerId: null }, 'POST', '/subscriptions'))).toBe(true);
  });

  it('niezalogowany nie dochodzi do sprawdzania uprawnień', async () => {
    const c = ctx(subkonto, 'POST', '/subscriptions');
    vi.spyOn(passport, 'canActivate').mockResolvedValue(false as never);
    expect(await guard().canActivate(c)).toBe(false);
  });
});

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomerPermissionsGuard } from '../common/guards/customer-permissions.guard.js';
import { UserServicesController } from '../subscriptions/services.controller.js';
import { CustomerIamController } from '../users/customer-iam.controller.js';

/**
 * Audyt 13.10 (impersonation-mints-persistent-node-credentials, iam-invite-persistent-access) — w sesji „Zaloguj
 * jako klient” operator mógł założyć na koncie klienta konto FTP, skrzynkę, użytkownika bazy, klucz SSH czy
 * zaproszenie IAM z danymi, które sam zna — trwały dostęp po końcu sesji. Teraz centralna odmowa w strażniku.
 */
const guard = new CustomerPermissionsGuard(new Reflector());
function kontekst(klasa: object, metoda: string, user: Record<string, unknown>, path: string) {
  const handler = (klasa as { prototype: Record<string, unknown> }).prototype[metoda] as () => void;
  expect(typeof handler).toBe('function');
  return {
    switchToHttp: () => ({ getRequest: () => ({ method: 'POST', path, route: { path }, user, params: { id: 's1' } }) }),
    getHandler: () => handler,
    getClass: () => klasa,
  } as never;
}
const WSPARCIE = { userId: 'klient', principalUserId: 'klient', customerOwnerId: null, impersonatedBy: 'operator' };
const KLIENT = { userId: 'klient', principalUserId: 'klient', customerOwnerId: null };

describe('Sesja wsparcia nie tworzy trwałych poświadczeń konta klienta', () => {
  it.each([
    ['createHostingFtp', '/services/:id/hosting-ftp'],
    ['changeHostingFtpPassword', '/services/:id/hosting-ftp/:username/password'],
  ])('%s: w impersonacji 403, klient sam — przepuszczony', (metoda, path) => {
    expect(() => guard.canActivate(kontekst(UserServicesController, metoda, WSPARCIE, path))).toThrow(ForbiddenException);
    expect(guard.canActivate(kontekst(UserServicesController, metoda, KLIENT, path))).toBe(true);
  });

  it('każda trasa tworząca poświadczenia ma oznaczenie (FTP, poczta, bazy, SSH, webhook git, PostgreSQL, przekierowania)', () => {
    const r = new Reflector();
    const p = UserServicesController.prototype as unknown as Record<string, () => void>;
    const oznaczone = Object.getOwnPropertyNames(p).filter((m) => typeof p[m] === 'function' && r.get('verris:bez-sesji-wsparcia', p[m]));
    expect(oznaczone.length).toBeGreaterThanOrEqual(13);
  });

  it('zaproszenie IAM w impersonacji → 403', () => {
    expect(() => guard.canActivate(kontekst(CustomerIamController, 'invite', WSPARCIE, '/customer-iam/invites'))).toThrow(ForbiddenException);
    expect(guard.canActivate(kontekst(CustomerIamController, 'invite', KLIENT, '/customer-iam/invites'))).toBe(true);
  });
});

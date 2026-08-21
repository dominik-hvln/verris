import { ForbiddenException } from '@nestjs/common';
import { CustomerPermission } from '@verris/database';
import {
  CustomerPermissionsGuard,
  inferCustomerRoutePermissions,
} from './customer-permissions.guard';

/**
 * Z-04 — subkonta klienta.
 *
 * Poprzednia wersja tego pliku sprawdzała wyłącznie funkcję wnioskującą, czyli
 * kawałek logiki wyrwany ze strażnika. Audyt (pozycja X-10) wytknął to wprost:
 * testy RBAC sprawdzały, że dekorator napisano, a nie że strażnik blokuje.
 * Dlatego tutaj testujemy `canActivate` — z podstawionym kontekstem żądania.
 *
 * Najważniejszy przypadek jest ostatni: trasa, której nikt nie sklasyfikował,
 * ma być ODMÓWIONA. Do 2026-08-21 była przepuszczana i to jest cała treść Z-04.
 */
describe('CustomerPermissionsGuard — zachowanie', () => {
  const guard = (jawne?: CustomerPermission[]) =>
    new CustomerPermissionsGuard({
      getAllAndOverride: () => jawne,
    } as never);

  const zadanie = (
    method: string,
    path: string,
    user: { customerOwnerId?: string | null; customerPermissions?: CustomerPermission[] } | null,
  ) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ method, route: { path }, user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as never;

  describe('właściciel konta', () => {
    it('przechodzi wszędzie — ten strażnik go nie dotyczy', () => {
      for (const [m, p] of [
        ['POST', '/vps'],
        ['POST', '/me/account-deletion'],
        ['GET', '/trasa/ktorej-nikt-nie-zna'],
      ] as const) {
        expect(guard().canActivate(zadanie(m, p, { customerOwnerId: null }))).toBe(true);
      }
    });

    it('brak użytkownika w żądaniu też przechodzi (autoryzacją zajmuje się JwtAuthGuard)', () => {
      expect(guard().canActivate(zadanie('GET', '/services', null))).toBe(true);
    });
  });

  describe('subkonto — trasy z uprawnieniem', () => {
    const sub = (...uprawnienia: CustomerPermission[]) => ({
      customerOwnerId: 'wlasciciel-1',
      customerPermissions: uprawnienia,
    });

    it('przepuszcza, gdy uprawnienie jest nadane', () => {
      expect(
        guard().canActivate(zadanie('GET', '/services', sub(CustomerPermission.SERVICES_READ))),
      ).toBe(true);
    });

    it('blokuje, gdy uprawnienia brak', () => {
      expect(
        guard().canActivate(zadanie('POST', '/services', sub(CustomerPermission.SERVICES_READ))),
      ).toBe(false);
    });

    it('odczyt profilu nie wymaga niczego, zmiana wymaga SETTINGS_MANAGE', () => {
      expect(guard().canActivate(zadanie('GET', '/users/me', sub()))).toBe(true);
      expect(guard().canActivate(zadanie('PATCH', '/users/me', sub()))).toBe(false);
      expect(
        guard().canActivate(zadanie('PATCH', '/users/me', sub(CustomerPermission.SETTINGS_MANAGE))),
      ).toBe(true);
    });

    it('jawny dekorator wygrywa z wnioskowaniem ze ścieżki', () => {
      const g = guard([CustomerPermission.BILLING_MANAGE]);
      expect(g.canActivate(zadanie('GET', '/services', sub(CustomerPermission.SERVICES_READ)))).toBe(false);
      expect(g.canActivate(zadanie('GET', '/services', sub(CustomerPermission.BILLING_MANAGE)))).toBe(true);
    });
  });

  describe('subkonto — operacje zastrzeżone dla właściciela', () => {
    // Każda z tych tras była przed poprawką w pełni otwarta dla subkonta
    // z dowolnym (albo żadnym) uprawnieniem.
    const ZASTRZEZONE: Array<[string, string, string]> = [
      ['POST', '/me/account-deletion', 'usunięcie konta właściciela'],
      ['POST', '/me/data-export', 'eksport RODO danych właściciela'],
      ['GET', '/me/dpa.pdf', 'umowa powierzenia właściciela'],
      ['POST', '/partners/me/payouts/bank', 'wypłata prowizji na konto bankowe'],
      ['GET', '/reseller/me/clients', 'lista klientów resellera'],
      ['POST', '/users/iam/invites', 'zapraszanie kolejnych subkont'],
      ['DELETE', '/users/iam/members/:id', 'usuwanie innych subkont'],
      ['PATCH', '/users/password', 'zmiana hasła konta nadrzędnego'],
      ['POST', '/servers/handshake', 'powierzchnia węzła'],
    ];

    it.each(ZASTRZEZONE)('%s %s — %s: odmowa mimo pełni uprawnień', (metoda, sciezka) => {
      const wszystkie = Object.values(CustomerPermission) as CustomerPermission[];
      expect(() =>
        guard().canActivate(
          zadanie(metoda, sciezka, {
            customerOwnerId: 'wlasciciel-1',
            customerPermissions: wszystkie,
          }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('subkonto — operacje kosztowe wymagają właściwego uprawnienia', () => {
    const sub = (...u: CustomerPermission[]) => ({
      customerOwnerId: 'wlasciciel-1',
      customerPermissions: u,
    });

    it('zamówienie VPS-a wymaga SERVICES_MANAGE', () => {
      expect(guard().canActivate(zadanie('POST', '/vps', sub(CustomerPermission.TICKETS_READ)))).toBe(false);
      expect(guard().canActivate(zadanie('POST', '/vps', sub(CustomerPermission.SERVICES_MANAGE)))).toBe(true);
    });

    it('skasowanie VPS-a wymaga SERVICES_MANAGE', () => {
      expect(guard().canActivate(zadanie('DELETE', '/vps/:id', sub(CustomerPermission.SERVICES_READ)))).toBe(false);
    });

    it('zakup dodatku wymaga BILLING_MANAGE, nie SERVICES_MANAGE', () => {
      // To wydatek z portfela właściciela, więc pilnuje go uprawnienie do pieniędzy.
      expect(
        guard().canActivate(zadanie('POST', '/addons/purchase', sub(CustomerPermission.SERVICES_MANAGE))),
      ).toBe(false);
      expect(
        guard().canActivate(zadanie('POST', '/addons/purchase', sub(CustomerPermission.BILLING_MANAGE))),
      ).toBe(true);
    });

    it('kampanie e-mail wymagają EMAIL_MANAGE', () => {
      expect(
        guard().canActivate(
          zadanie('POST', '/email-marketing/:subscriptionId/campaigns/:campaignId/send', sub(CustomerPermission.SERVICES_MANAGE)),
        ),
      ).toBe(false);
      expect(
        guard().canActivate(
          zadanie('POST', '/email-marketing/:subscriptionId/campaigns/:campaignId/send', sub(CustomerPermission.EMAIL_MANAGE)),
        ),
      ).toBe(true);
    });
  });

  describe('domyślna odpowiedź dla nieznanej trasy', () => {
    it('to ODMOWA, nie przepuszczenie — sedno Z-04', () => {
      expect(inferCustomerRoutePermissions('POST', '/zupelnie/nowa/trasa')).toBe('ODMOWA');
      expect(() =>
        guard().canActivate(
          zadanie('POST', '/zupelnie/nowa/trasa', {
            customerOwnerId: 'wlasciciel-1',
            customerPermissions: Object.values(CustomerPermission) as CustomerPermission[],
          }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('wnioskowanie ze ścieżki — przypadki, które muszą zostać jak były', () => {
    const infer = inferCustomerRoutePermissions;

    it('hosting-dns przed ogólną regułą services', () => {
      expect(infer('GET', '/services/sub-1/hosting-dns')).toEqual([CustomerPermission.DNS_MANAGE]);
    });

    it('hosting-email pod ścieżką services', () => {
      expect(infer('POST', '/services/sub-1/hosting-email/mailboxes')).toEqual([CustomerPermission.EMAIL_MANAGE]);
    });

    it('file-manager pod ścieżką services', () => {
      expect(infer('GET', '/services/sub-1/file-manager')).toEqual([CustomerPermission.FILES_MANAGE]);
    });

    it('ogólna lista usług', () => {
      expect(infer('GET', '/services')).toEqual([CustomerPermission.SERVICES_READ]);
    });

    it('operacje na portfelu', () => {
      expect(infer('POST', '/billing/wallet/topup')).toEqual([CustomerPermission.BILLING_MANAGE]);
    });
  });
});

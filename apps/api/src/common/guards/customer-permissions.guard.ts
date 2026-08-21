import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomerPermission } from '@verris/database';
import { CUSTOMER_PERMISSIONS_KEY } from '../decorators/customer-permissions.decorator';

/**
 * Z-04 — uprawnienia subkont klienta.
 *
 * Subkonto to konto pracownika klienta (np. jego agencji), działające w ramach
 * konta właściciela. Ten strażnik decyduje, czego subkontu wolno dotknąć.
 *
 * DO 2026-08-21 funkcja wnioskująca kończyła się `return []`, czyli
 * „nie wymagam żadnego uprawnienia" — a więc PRZEPUŚĆ. Trasa, której nikt nie
 * dopisał do listy dopasowań, była dla subkonta w pełni otwarta. Przegląd
 * wszystkich tras pokazał 148 takich przypadków, w tym:
 *
 *   POST   /vps                      zamówienie VPS-a na portfel właściciela
 *   DELETE /vps/:id                  skasowanie VPS-a właściciela
 *   POST   /addons/purchase          zakup dodatku na portfel właściciela
 *   POST   /partners/me/payouts/bank wypłata prowizji właściciela na konto bankowe
 *   POST   /me/account-deletion      usunięcie konta właściciela
 *   POST   /me/data-export           eksport RODO wszystkich danych właściciela
 *   POST   /users/iam/invites        zapraszanie kolejnych subkont
 *   DELETE /users/iam/members/:id    usuwanie innych subkont
 *
 * Subkonto z jedynym uprawnieniem TICKETS_READ mogło wykonać każdą z nich.
 *
 * Zmiana polega na odwróceniu domyślnej odpowiedzi: **nierozpoznana trasa jest
 * odmawiana**. Nowa trasa dodana bez wpisu w tej tabeli przestaje działać dla
 * subkont — co jest niewygodne i o to chodzi. Poprzedni domyślny „przepuść"
 * oznaczał, że każde przeoczenie było dziurą, o której nikt się nie dowiadywał.
 *
 * Właściciela konta (`customerOwnerId == null`) ten strażnik w ogóle nie dotyczy.
 */

/** Wynik klasyfikacji trasy: lista wymaganych uprawnień albo twarda odmowa. */
export type WymogTrasy = CustomerPermission[] | 'ODMOWA';

const {
  BILLING_READ, BILLING_MANAGE,
  SERVICES_READ, SERVICES_MANAGE,
  DOMAINS_READ, DOMAINS_MANAGE,
  DNS_MANAGE, EMAIL_MANAGE, FILES_MANAGE,
  TICKETS_READ, TICKETS_MANAGE, SETTINGS_MANAGE,
} = CustomerPermission;

/** Pusta lista = trasa dostępna dla każdego subkonta, bez dodatkowego uprawnienia. */
const BEZ_WYMOGU: CustomerPermission[] = [];

interface Regula {
  /** Dopasowanie po znormalizowanej (małe litery) ścieżce. */
  pasuje: (sciezka: string) => boolean;
  /** Wymóg dla odczytu (GET) i dla reszty metod. */
  odczyt: WymogTrasy;
  zapis: WymogTrasy;
  /** Krótkie uzasadnienie — czytane przy przeglądach, nie tylko dekoracja. */
  po_co: string;
}

const zawiera = (...fragmenty: string[]) => (s: string) => fragmenty.some((f) => s.includes(f));
const zaczyna = (...prefiksy: string[]) => (s: string) => prefiksy.some((p) => s === p || s.startsWith(`${p}/`));

/**
 * Kolejność ma znaczenie — wygrywa pierwsza pasująca reguła. Trasy szczegółowe
 * (hosting-dns, file-manager) muszą stać przed ogólnymi (services).
 */
export const REGULY_TRAS: Regula[] = [
  // --- zawsze dostępne: konto własne, treści publiczne, zdrowie usługi -------
  {
    pasuje: zaczyna('/auth', '/healthz', '/readyz', '/status', '/public', '/fonts', '/kb', '/plans', '/legal', '/brand', '/emm', '/unsubscribe', '/analytics', '/telemetry', '/metrics'),
    odczyt: BEZ_WYMOGU, zapis: BEZ_WYMOGU,
    po_co: 'Treści publiczne i endpointy techniczne — nie dotykają danych konta.',
  },
  {
    pasuje: zaczyna('/notifications'),
    odczyt: BEZ_WYMOGU, zapis: BEZ_WYMOGU,
    po_co: 'Własne powiadomienia i oznaczanie ich jako przeczytane.',
  },
  {
    pasuje: zaczyna('/me/consent', '/me/marketing-preferences', '/me/status'),
    odczyt: BEZ_WYMOGU, zapis: BEZ_WYMOGU,
    po_co: 'Zgody i preferencje marketingowe dotyczą osoby zalogowanej.',
  },

  // --- odmowa twarda: rzeczy właściciela konta ------------------------------
  {
    pasuje: zaczyna('/me/account-deletion'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Usunięcie konta jest nieodwracalne i należy wyłącznie do właściciela.',
  },
  {
    pasuje: (sciezka) => zaczyna('/me/data-export')(sciezka) || sciezka.includes('/me/dpa.pdf'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Eksport RODO i DPA obejmują całość danych właściciela, nie subkonta.',
  },
  {
    pasuje: zaczyna('/partners', '/reseller'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Program partnerski i resellerski to rozliczenia właściciela — łącznie z wypłatą prowizji na konto bankowe.',
  },
  {
    pasuje: zaczyna('/users/iam'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Zarządzanie subkontami należy do właściciela; inaczej subkonto zaprasza kolejne i usuwa pozostałe.',
  },
  {
    pasuje: zaczyna('/users/password'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Zmiana hasła idzie po koncie nadrzędnym sesji — dla subkonta to hasło właściciela.',
  },
  {
    pasuje: zaczyna('/agent', '/node', '/servers'),
    odczyt: 'ODMOWA', zapis: 'ODMOWA',
    po_co: 'Powierzchnia węzła i agenta. Konto klienckie nie ma tu czego szukać.',
  },

  // --- reguły z uprawnieniami ----------------------------------------------
  {
    pasuje: zawiera('billing', 'invoices'),
    odczyt: [BILLING_READ], zapis: [BILLING_MANAGE],
    po_co: 'Portfel, faktury, metody płatności. „invoices" obejmuje też /api/v1/invoices.',
  },
  {
    pasuje: zaczyna('/api/v1/me'),
    odczyt: BEZ_WYMOGU, zapis: [SETTINGS_MANAGE],
    po_co: 'Publiczne API v1 — profil konta, ten sam wymóg co /users/me.',
  },
  {
    pasuje: zawiera('hosting-dns'),
    odczyt: [DNS_MANAGE], zapis: [DNS_MANAGE],
    po_co: 'Rekordy DNS. Odczyt też wymaga uprawnienia — układ strefy bywa wrażliwy.',
  },
  {
    pasuje: zawiera('hosting-email', 'hosting-autoresponders', 'hosting-catchall', 'hosting-spamfilter'),
    odczyt: [EMAIL_MANAGE], zapis: [EMAIL_MANAGE],
    po_co: 'Skrzynki i reguły pocztowe.',
  },
  {
    pasuje: zaczyna('/email-marketing'),
    odczyt: [EMAIL_MANAGE], zapis: [EMAIL_MANAGE],
    po_co: 'Kampanie wychodzą z domeny właściciela i obciążają jego reputację nadawcy.',
  },
  {
    pasuje: zawiera('file-manager', 'hosting-files'),
    odczyt: [FILES_MANAGE], zapis: [FILES_MANAGE],
    po_co: 'Menedżer plików — dostęp do treści strony.',
  },
  {
    pasuje: zaczyna('/vps'),
    odczyt: [SERVICES_READ], zapis: [SERVICES_MANAGE],
    po_co: 'Zamówienie, wyłączenie i skasowanie VPS-a. Zamówienie obciąża portfel właściciela.',
  },
  {
    pasuje: zaczyna('/addons'),
    odczyt: [SERVICES_READ], zapis: [BILLING_MANAGE],
    po_co: 'Zakup dodatku to wydatek z portfela właściciela — stąd BILLING_MANAGE, nie SERVICES_MANAGE.',
  },
  {
    pasuje: zaczyna('/autoscaling'),
    odczyt: [SERVICES_READ], zapis: [SERVICES_MANAGE],
    po_co: 'Kalkulator i ustawienia autoskalowania.',
  },
  {
    pasuje: zaczyna('/analytics-sites'),
    odczyt: [SERVICES_READ], zapis: [SERVICES_MANAGE],
    po_co: 'Witryny podpięte do analityki usługi.',
  },
  {
    pasuje: zawiera('subscriptions', 'services'),
    odczyt: [SERVICES_READ], zapis: [SERVICES_MANAGE],
    po_co: 'Usługi hostingowe — ogólna reguła, po szczegółowych.',
  },
  {
    pasuje: zawiera('domains'),
    odczyt: [DOMAINS_READ], zapis: [DOMAINS_MANAGE],
    po_co: 'Domeny: rejestracja, transfer, odnowienie.',
  },
  {
    pasuje: zawiera('tickets'),
    odczyt: [TICKETS_READ], zapis: [TICKETS_MANAGE],
    po_co: 'Zgłoszenia do wsparcia.',
  },
  {
    pasuje: zawiera('users/me/api-tokens'),
    odczyt: [SETTINGS_MANAGE], zapis: [SETTINGS_MANAGE],
    po_co: 'Tokeny API działają w imieniu konta nadrzędnego — także ich lista.',
  },
  {
    pasuje: (s) => s.includes('users/me') || s.includes('settings'),
    odczyt: BEZ_WYMOGU, zapis: [SETTINGS_MANAGE],
    po_co: 'Profil i ustawienia konta: odczyt wolno, zmiana za uprawnieniem.',
  },
];

/**
 * Zwraca wymóg dla pary (metoda, ścieżka).
 *
 * `'ODMOWA'` oznacza: subkonto nie ma tu wstępu niezależnie od nadanych
 * uprawnień. Nierozpoznana trasa również daje `'ODMOWA'` — to jest ta zmiana,
 * o którą chodzi w Z-04.
 *
 * Wyeksportowane, bo testuje to zarówno test zachowania strażnika, jak i test
 * przemiatający wszystkie trasy API (`customer-permissions.coverage.spec.ts`).
 */
export function inferCustomerRoutePermissions(method: string, path: string): WymogTrasy {
  const odczyt = method.toUpperCase() === 'GET';
  const normalized = path.toLowerCase();
  for (const regula of REGULY_TRAS) {
    if (regula.pasuje(normalized)) return odczyt ? regula.odczyt : regula.zapis;
  }
  return 'ODMOWA';
}

@Injectable()
export class CustomerPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      path?: string;
      user?: {
        customerOwnerId?: string | null;
        customerPermissions?: CustomerPermission[];
      };
    }>();
    const user = req.user;

    // Właściciel konta — subkontowa kontrola go nie dotyczy.
    if (!user?.customerOwnerId) return true;

    const jawne = this.reflector.getAllAndOverride<CustomerPermission[]>(
      CUSTOMER_PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const wymagane =
      jawne ??
      inferCustomerRoutePermissions(req.method ?? 'GET', req.route?.path ?? req.path ?? '');

    if (wymagane === 'ODMOWA') {
      throw new ForbiddenException(
        'Ta operacja jest dostępna wyłącznie dla właściciela konta.',
      );
    }
    if (wymagane.length === 0) return true;

    const nadane = new Set(user.customerPermissions ?? []);
    return wymagane.every((uprawnienie) => nadane.has(uprawnienie));
  }
}

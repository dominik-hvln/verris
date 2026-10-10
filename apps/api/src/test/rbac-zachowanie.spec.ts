import { ExecutionContext, ForbiddenException, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { STAFF_PERMISSIONS_ANY_KEY, STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { ROLE_SYSTEMOWE } from '../staff-roles/role-systemowe.js';
import { STAFF_PERMISSION_KEYS } from '../staff-roles/staff-permissions.catalog.js';

/**
 * X-10 — RBAC sprawdzany ZACHOWANIEM, nie metadanymi.
 *
 * Wcześniejsze specy czytały Reflect.getMetadata(ROLES_KEY) — dowodziły, że ktoś
 * napisał dekorator, nie że strażnik odmawia. Tu każdą trasę każdego kontrolera
 * `admin/*` przepuszczamy przez PRAWDZIWE RolesGuard i StaffPermissionsGuard
 * (z prawdziwym Reflectorem) i sprawdzamy wynik dla konta klienta, operatora bez
 * uprawnień, operatora z uprawnieniami i administratora.
 */
type Uzytkownik = { userId: string; role: 'USER' | 'STAFF' | 'ADMIN' };
type Trasa = { kontroler: string; klasa: Type<unknown>; metoda: string; handler: (...args: unknown[]) => unknown; sciezka: string };

const SRC = resolve(import.meta.dirname, '..');
/** Trasy paneli operatorskich: `admin/*`, `staff/*` i `…/admin/*` (np. `tickets/admin/:id/usluga`). */
const TRASA_OPERATORA = /^(admin|staff)(\/|$)|\/admin(\/|$)/;
/** Fala 2A (D1) — role z @Roles trasy (metoda nadpisuje klasę, jak w RolesGuard). */
const roleTrasy = (handler: object, klasa: object) => new Reflector().getAllAndOverride<string[] | undefined>(ROLES_KEY, [handler as never, klasa as never]);
/**
 * Trasa operatora: ścieżka panelu operatora albo @Roles dopuszczające STAFF bez klienta (USER) — np. `ai/staff/chat`,
 * `auth/break-glass/*`. Panel admina wpuszcza STAFF (D1), więc liczy się każda trasa, którą STAFF może wywołać.
 */
const jestTrasaOperatora = (pelna: string, role: string[] | undefined) =>
  TRASA_OPERATORA.test(pelna) || (!!role?.includes('STAFF') && !role.includes('USER'));

function plikiKontrolerow(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...plikiKontrolerow(p));
    // Fala 2A — wszystkie kontrolery (także `@Controller()` i `ai`, `auth`): trasę operatora rozpoznaje jestTrasaOperatora.
    else if (n.endsWith('.controller.ts') && readFileSync(p, 'utf-8').includes('@Controller(')) out.push(p);
  }
  return out;
}

async function trasyAdmina(): Promise<Trasa[]> {
  const out: Trasa[] = [];
  for (const plik of plikiKontrolerow(SRC)) {
    const mod = (await import(plik)) as Record<string, unknown>;
    for (const [nazwa, klasa] of Object.entries(mod)) {
      if (typeof klasa !== 'function') continue;
      const sciezka = Reflect.getMetadata(PATH_METADATA, klasa) as string | undefined;
      if (typeof sciezka !== 'string') continue;
      for (const metoda of Object.getOwnPropertyNames(klasa.prototype)) {
        const handler = (klasa.prototype as Record<string, unknown>)[metoda];
        if (metoda === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        // Pełna ścieżka (kontroler + metoda): trasy operatorów mieszkają też poza `admin/*` — `staff/*`
        // i `tickets/admin/*` (PB-43 powiązanie i diagnostyka zgłoszenia, PB-45 migracja za klienta).
        const pelna = [sciezka, String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')]
          .join('/')
          .split('/')
          .filter(Boolean)
          .join('/');
        if (!jestTrasaOperatora(pelna, roleTrasy(handler, klasa))) continue;
        out.push({ kontroler: nazwa, klasa: klasa as Type<unknown>, metoda, handler: handler as (...args: unknown[]) => unknown, sciezka: pelna });
      }
    }
  }
  return out;
}

function kontekst(t: Trasa, user: Uzytkownik): ExecutionContext {
  return {
    getHandler: () => t.handler,
    getClass: () => t.klasa,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Łańcuch strażników trasy (klasa + metoda); true = wpuszczony. */
async function wpuszcza(t: Trasa, user: Uzytkownik, uprawnienia: string[] = []): Promise<boolean> {
  const reflector = new Reflector();
  const prisma = { user: { findUnique: async () => ({ staffRole: { permissions: uprawnienia } }) } };
  const straznicy = [
    ...((Reflect.getMetadata(GUARDS_METADATA, t.klasa) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, t.handler) as unknown[]) ?? []),
  ];
  for (const S of straznicy) {
    let wynik: boolean;
    try {
      if (S === RolesGuard) wynik = new RolesGuard(reflector).canActivate(kontekst(t, user));
      else if (S === StaffPermissionsGuard) wynik = await new StaffPermissionsGuard(reflector, prisma as never).canActivate(kontekst(t, user));
      else continue; // JwtAuthGuard itp. — uwierzytelnienie, nie autoryzacja
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
    if (!wynik) return false;
  }
  return true;
}

const TRASY = await trasyAdmina();
const KLIENT: Uzytkownik = { userId: 'c', role: 'USER' };
const OPERATOR: Uzytkownik = { userId: 's', role: 'STAFF' };
const ADMIN: Uzytkownik = { userId: 'a', role: 'ADMIN' };
const nazwa = (t: Trasa) => `${t.kontroler}.${t.metoda} (${t.sciezka})`;

describe('X-10 — RBAC paneli operatorskich sprawdzany zachowaniem', () => {
  it('znaleziono trasy admin/* do sprawdzenia (strażnik nie jest pusty)', () => {
    expect(TRASY.length).toBeGreaterThan(100);
  });

  it('trasy operatorów poza admin/* też są sprawdzane (staff/*, tickets/admin/*)', () => {
    const sciezki = TRASY.map((t) => t.sciezka);
    expect(sciezki).toEqual(
      expect.arrayContaining([
        'tickets/admin/:id/usluga',
        'tickets/admin/:id/diagnostyka',
        'staff/migrations/za-klienta',
        'staff/migrations/za-klienta/preflight',
      ]),
    );
    // Trasy klienta z tych samych kontrolerów (np. `tickets/:id`) nie są trasami operatora; poza `admin/*`
    // liczą się tylko trasy z @Roles dla STAFF (np. asystent pracowników, break-glass).
    expect(sciezki.filter((s) => !TRASA_OPERATORA.test(s)).sort()).toEqual(
      expect.arrayContaining(['ai/staff/chat', 'auth/break-glass/status']),
    );
    expect(TRASY.filter((t) => !TRASA_OPERATORA.test(t.sciezka) && !roleTrasy(t.handler, t.klasa)?.includes('STAFF'))).toEqual([]);
  });

  it('konto klienta (USER) nie wchodzi na ŻADNĄ trasę operatora (admin/*, staff/*, tickets/admin/*)', async () => {
    const wpuszczone: string[] = [];
    for (const t of TRASY) if (await wpuszcza(t, KLIENT, ['*'])) wpuszczone.push(nazwa(t));
    // Jedyny wyjątek: zakończenie impersonacji woła panel klienta tokenem impersonacji (rola USER) — handler wymaga
    // impersonatedBy w tokenie i bez niego odrzuca (users.admin.controller.ts stop, PB-41 08.10).
    expect(wpuszczone.filter((n) => !n.startsWith('UsersAdminController.stop '))).toEqual([]);
  });

  it('operator bez żadnych uprawnień wchodzi tylko tam, gdzie trasa nie wymaga uprawnienia', async () => {
    const wpuszczoneMimoWymogu: string[] = [];
    for (const t of TRASY) {
      const wymagane = new Reflector().getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [t.handler, t.klasa]);
      // L1-KARTA — @StaffPermAny na metodzie to też wymóg uprawnienia (jednego z listy).
      const ktorekolwiek = Reflect.getMetadata(STAFF_PERMISSIONS_ANY_KEY, t.handler) as string[] | undefined;
      if (!wymagane?.length && !ktorekolwiek?.length) continue;
      if (await wpuszcza(t, OPERATOR, [])) wpuszczoneMimoWymogu.push(nazwa(t));
    }
    expect(wpuszczoneMimoWymogu).toEqual([]);
  });

  it('@StaffPermAny tylko na metodach — żaden kontroler operatora nie ma any-of na klasie (L1-KARTA)', () => {
    const klasy = [...new Set(TRASY.map((t) => t.klasa))];
    expect(klasy.filter((k) => Reflect.getMetadata(STAFF_PERMISSIONS_ANY_KEY, k) !== undefined).map((k) => k.name)).toEqual([]);
  });

  it('administrator wchodzi wszędzie', async () => {
    const odrzucone: string[] = [];
    for (const t of TRASY) if (!(await wpuszcza(t, ADMIN))) odrzucone.push(nazwa(t));
    // Konfiguracja sesji panelu obsługi — tylko STAFF (panel admina ma własną: platform-settings/admin).
    expect(odrzucone).toEqual(['PlatformSettingsController.getStaffSessionConfig (platform-settings/staff)']);
  });

  it('trasy tylko dla administratora odrzucają operatora nawet z kompletem uprawnień', async () => {
    const grafana = TRASY.find((t) => t.kontroler === 'UsersAdminController' && t.metoda === 'setGrafanaAccess');
    expect(grafana).toBeDefined();
    expect(await wpuszcza(grafana!, OPERATOR, ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE', 'STAFF_MANAGE'])).toBe(false);
    expect(await wpuszcza(grafana!, ADMIN)).toBe(true);
  });

  it('operator z właściwym uprawnieniem przechodzi, z sąsiednim — nie', async () => {
    const zaloz = TRASY.find((t) => t.kontroler === 'UsersAdminController' && t.metoda === 'createCustomer');
    expect(zaloz).toBeDefined();
    expect(await wpuszcza(zaloz!, OPERATOR, ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE'])).toBe(true);
    expect(await wpuszcza(zaloz!, OPERATOR, ['CUSTOMERS_VIEW'])).toBe(false);
  });
});

/**
 * L1-KARTA (decyzja 08.10) — karta usługi w panelu obsługi dla ról systemowych: L1 Konsultant otwiera ją
 * w podglądzie (nagłówek, zasoby, historia migracji, stan odtwarzania), ale nie zmienia planu, nie odtwarza
 * i nie czyta kopii z węzła. NOC (SUBSCRIPTIONS_MANAGE bez CUSTOMERS_VIEW) nie traci karty.
 */
describe('L1-KARTA — karta usługi dla ról systemowych', () => {
  const uprawnieniaRoli = (nazwa: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === nazwa)!.permissions];
  const L1 = uprawnieniaRoli('L1 Konsultant');
  const NOC = uprawnieniaRoli('Inżynier infrastruktury (NOC/DevOps)');
  const trasa = (metoda: string) => {
    const t = TRASY.find((x) => x.kontroler === 'SubscriptionsAdminController' && x.metoda === metoda);
    expect(t, metoda).toBeDefined();
    return t!;
  };
  const wynik = async (uprawnienia: string[], metody: string[]) =>
    Object.fromEntries(await Promise.all(metody.map(async (m) => [m, await wpuszcza(trasa(m), OPERATOR, uprawnienia)] as const)));

  it('L1: odczyty karty tak; zmiana planu, odtworzenie, migracja, kopie z węzła i zawieszenie — nie', async () => {
    expect(L1).not.toContain('SUBSCRIPTIONS_MANAGE');
    expect(
      await wynik(L1, [
        'detail',
        'usage',
        'migrationTimeline',
        'hostingRestoreStatus',
        'runDiagnostics',
        'listEligiblePlans',
        'previewPlanChange',
        'changePlan',
        'runHostingRestore',
        'requestInternalMigration',
        'hostingBackups',
        'suspend',
      ]),
    ).toEqual({
      detail: true,
      usage: true,
      migrationTimeline: true,
      hostingRestoreStatus: true,
      runDiagnostics: true, // TICKETS_MANAGE — jak diagnostyka z rozmowy (PB-43)
      listEligiblePlans: false,
      previewPlanChange: false,
      changePlan: false,
      runHostingRestore: false,
      requestInternalMigration: false,
      hostingBackups: false,
      suspend: false,
    });
  });

  it('F2.3 (D2): zawieszenie i odwieszenie — L3 i zespół abuse sami; L1, L2 i NOC nie (L2 składa wniosek)', async () => {
    const metody = ['suspend', 'unsuspend'];
    for (const rola of ['L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo']) {
      expect({ rola, w: await wynik(uprawnieniaRoli(rola), metody) }).toEqual({ rola, w: { suspend: true, unsuspend: true } });
    }
    for (const rola of ['L1 Konsultant', 'L2 Specjalista techniczny', 'Inżynier infrastruktury (NOC/DevOps)', 'Audytor (tylko podgląd)']) {
      expect({ rola, w: await wynik(uprawnieniaRoli(rola), metody) }).toEqual({ rola, w: { suspend: false, unsuspend: false } });
    }
  });

  it('F2.4: eksport list do CSV (dane osobowe) — tylko z EXPORT_DATA (L4), obok uprawnienia do samej listy', async () => {
    const eksporty = TRASY.filter((t) => t.metoda === 'exportCsv' && ['SubscriptionsAdminController', 'UsersAdminController'].includes(t.kontroler));
    expect(eksporty).toHaveLength(2);
    for (const t of eksporty) {
      expect({ t: nazwa(t), l3: await wpuszcza(t, OPERATOR, uprawnieniaRoli('L3 Starszy specjalista')) }).toEqual({ t: nazwa(t), l3: false });
      expect({ t: nazwa(t), l4: await wpuszcza(t, OPERATOR, uprawnieniaRoli('L4 Kierownik zmiany')) }).toEqual({ t: nazwa(t), l4: true });
      expect({ t: nazwa(t), sam: await wpuszcza(t, OPERATOR, ['EXPORT_DATA']) }).toEqual({ t: nazwa(t), sam: false });
    }
  });

  it('decyzja 10.10: dane dostępowe migracji (stary hosting) odkrywa L2 — support migracji; L1 (helpdesk) nie', async () => {
    const t = TRASY.find((x) => x.kontroler === 'MigrationsStaffController' && x.metoda === 'revealSecrets');
    expect(t).toBeDefined();
    expect(await wpuszcza(t!, OPERATOR, uprawnieniaRoli('L1 Konsultant'))).toBe(false);
    expect(await wpuszcza(t!, OPERATOR, uprawnieniaRoli('L2 Specjalista techniczny'))).toBe(true);
  });

  it('decyzja 10.10: eksport faktur i transakcji portfela tylko z EXPORT_DATA — L1 przegląda płatności, ale nie eksportuje', async () => {
    const eksporty = TRASY.filter(
      (t) =>
        (t.kontroler === 'InvoicesAdminController' && t.metoda === 'exportCsv') ||
        (t.kontroler === 'BillingAdminController' && t.metoda === 'exportTransactionsCsv'),
    );
    expect(eksporty).toHaveLength(2);
    for (const t of eksporty) {
      for (const rola of ['L1 Konsultant', 'L3 Starszy specjalista']) {
        expect({ t: nazwa(t), rola, w: await wpuszcza(t, OPERATOR, uprawnieniaRoli(rola)) }).toEqual({ t: nazwa(t), rola, w: false });
      }
      expect({ t: nazwa(t), l4: await wpuszcza(t, OPERATOR, uprawnieniaRoli('L4 Kierownik zmiany')) }).toEqual({ t: nazwa(t), l4: true });
    }
    // Przegląd faktur zostaje dla L1 (stan opłacenia usługi).
    const lista = TRASY.find((t) => t.kontroler === 'InvoicesAdminController' && t.metoda === 'list');
    expect(lista).toBeDefined();
    expect(await wpuszcza(lista!, OPERATOR, uprawnieniaRoli('L1 Konsultant'))).toBe(true);
  });

  it('F2.2 (D2): pasek akcji konta — akcje odwracalne od L2 i zespołu abuse, DNS od L3; L1, NOC i audytor nie', async () => {
    const akcje = TRASY.filter((t) => t.kontroler === 'KontoKlientaAkcjeAdminController');
    const odwracalne = ['hasloSkrzynki', 'hasloFtp', 'hasloBazy', 'ssl', 'php', 'kopia', 'skan'];
    const dns = ['dnsDodaj', 'dnsZmien', 'dnsUsun'];
    expect(akcje.map((t) => t.metoda).sort()).toEqual([...odwracalne, ...dns].sort());
    const wolno = async (rola: string, metody: string[]) => {
      const out: Record<string, boolean> = {};
      for (const m of metody) out[m] = await wpuszcza(akcje.find((t) => t.metoda === m)!, OPERATOR, uprawnieniaRoli(rola));
      return out;
    };
    const wszystkie = (metody: string[], v: boolean) => Object.fromEntries(metody.map((m) => [m, v]));
    for (const rola of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo']) {
      expect({ rola, w: await wolno(rola, odwracalne) }).toEqual({ rola, w: wszystkie(odwracalne, true) });
    }
    for (const rola of ['L1 Konsultant', 'Inżynier infrastruktury (NOC/DevOps)', 'Audytor (tylko podgląd)']) {
      expect({ rola, w: await wolno(rola, [...odwracalne, ...dns]) }).toEqual({ rola, w: wszystkie([...odwracalne, ...dns], false) });
    }
    for (const rola of ['L2 Specjalista techniczny', 'Nadużycia i bezpieczeństwo']) {
      expect({ rola, w: await wolno(rola, dns) }).toEqual({ rola, w: wszystkie(dns, false) });
    }
    for (const rola of ['L3 Starszy specjalista', 'L4 Kierownik zmiany']) {
      expect({ rola, w: await wolno(rola, dns) }).toEqual({ rola, w: wszystkie(dns, true) });
    }
    // DNS to osobne uprawnienie — samo ACCOUNT_ACTIONS go nie daje, samo DNS_MANAGE nie daje resetu haseł.
    for (const m of dns) expect(await wpuszcza(akcje.find((t) => t.metoda === m)!, OPERATOR, ['ACCOUNT_ACTIONS'])).toBe(false);
    expect(await wpuszcza(akcje.find((t) => t.metoda === 'hasloSkrzynki')!, OPERATOR, ['DNS_MANAGE'])).toBe(false);
    for (const t of akcje) expect(await wpuszcza(t, ADMIN)).toBe(true);
  });

  it('F3.1 (D4): blokada wysyłki konta — L3, L4, zespół abuse i NOC; stan wysyłki od L2; L1 i audytor nic', async () => {
    const poczta = TRASY.filter((t) => t.kontroler === 'PocztaKontaAdminController');
    const t = (m: string) => {
      const x = poczta.find((p) => p.metoda === m);
      expect(x, m).toBeDefined();
      return x!;
    };
    const wolno = async (rola: string, metody: string[]) => {
      const out: Record<string, boolean> = {};
      for (const m of metody) out[m] = await wpuszcza(t(m), OPERATOR, uprawnieniaRoli(rola));
      return out;
    };
    const blokada = ['zablokuj', 'zwolnij'];
    for (const rola of ['L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo', 'Inżynier infrastruktury (NOC/DevOps)']) {
      expect({ rola, w: await wolno(rola, [...blokada, 'stanWysylki']) }).toEqual({ rola, w: { zablokuj: true, zwolnij: true, stanWysylki: true } });
    }
    expect(await wolno('L2 Specjalista techniczny', [...blokada, 'stanWysylki'])).toEqual({ zablokuj: false, zwolnij: false, stanWysylki: true });
    for (const rola of ['L1 Konsultant', 'Audytor (tylko podgląd)']) {
      expect({ rola, w: await wolno(rola, [...blokada, 'stanWysylki']) }).toEqual({ rola, w: { zablokuj: false, zwolnij: false, stanWysylki: false } });
    }
    // Sam podgląd kolejki nie daje blokady; samo NODES_MANAGE / ABUSE_MANAGE też nie.
    for (const m of blokada) {
      expect(await wpuszcza(t(m), OPERATOR, ['MAIL_QUEUE_VIEW', 'NODES_MANAGE', 'ABUSE_MANAGE', 'ACCOUNT_ACTIONS'])).toBe(false);
      expect(await wpuszcza(t(m), ADMIN)).toBe(true);
      expect(await wpuszcza(t(m), KLIENT, ['*', 'MAIL_SEND_BLOCK'])).toBe(false);
    }
  });

  it('NOC (bez CUSTOMERS_VIEW) nadal ma kartę i jej akcje', async () => {
    expect(NOC).not.toContain('CUSTOMERS_VIEW');
    const metody = ['detail', 'usage', 'migrationTimeline', 'hostingRestoreStatus', 'hostingBackups', 'runDiagnostics', 'listEligiblePlans', 'runHostingRestore'];
    expect(await wynik(NOC, metody)).toEqual(Object.fromEntries(metody.map((m) => [m, true])));
  });

  it('kopie z węzła: wystarcza sam podgląd konta (ACCOUNT_DIAGNOSTICS_VIEW); sam podgląd klientów nie wystarcza', async () => {
    expect(await wpuszcza(trasa('hostingBackups'), OPERATOR, ['ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(true);
    expect(await wpuszcza(trasa('hostingBackups'), OPERATOR, ['CUSTOMERS_VIEW'])).toBe(false);
    expect(await wpuszcza(trasa('runDiagnostics'), OPERATOR, ['CUSTOMERS_VIEW', 'TICKETS_VIEW'])).toBe(false);
  });

  it('klient (USER) nie wchodzi na kartę nawet z uprawnieniami z listy', async () => {
    for (const m of ['detail', 'usage', 'migrationTimeline', 'hostingRestoreStatus', 'runDiagnostics', 'hostingBackups']) {
      expect(await wpuszcza(trasa(m), KLIENT, ['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE', 'TICKETS_MANAGE', 'ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(false);
    }
  });
});

/**
 * Fala 2A (decyzja D1, 10.10) — panel admina wpuszcza STAFF, więc każda trasa, którą STAFF może wywołać, musi mieć
 * uprawnienie (@StaffPerm / @StaffPermAny), a akcje nieodwracalne i konfiguracja zostają tylko dla ADMIN-a.
 */
describe('D1 — panel operatora dla STAFF: macierz tras', () => {
  const straznicy = (t: Trasa) => [
    ...((Reflect.getMetadata(GUARDS_METADATA, t.klasa) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, t.handler) as unknown[]) ?? []),
  ];
  const WSZYSTKIE = [...STAFF_PERMISSION_KEYS];

  it('każda trasa operatora ma @Roles i RolesGuard; @StaffPerm/@StaffPermAny ma StaffPermissionsGuard', () => {
    const bez: string[] = [];
    for (const t of TRASY) {
      const g = straznicy(t);
      if (!roleTrasy(t.handler, t.klasa)?.length) bez.push(`bez @Roles: ${nazwa(t)}`);
      else if (!g.includes(RolesGuard)) bez.push(`bez RolesGuard: ${nazwa(t)}`);
      const perm =
        new Reflector().getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [t.handler, t.klasa])?.length ||
        (Reflect.getMetadata(STAFF_PERMISSIONS_ANY_KEY, t.handler) as string[] | undefined)?.length;
      if (perm && !g.includes(StaffPermissionsGuard)) bez.push(`bez StaffPermissionsGuard: ${nazwa(t)}`);
    }
    expect(bez).toEqual([]);
  });

  /**
   * Trasy, które STAFF wywołuje bez uprawnienia — tylko własne konto albo świadoma decyzja. Każda nowa pozycja
   * tutaj to decyzja, nie przeoczenie.
   */
  const BEZ_UPRAWNIENIA: Record<string, string> = {
    'StaffMeController.access': 'własne uprawnienia (menu panelu)',
    'ControlPlaneMailStaffController.connectionInfo': 'własna skrzynka pracownika',
    'AuthController.breakGlassStatus': 'własne kody awaryjne',
    'AuthController.breakGlassRegenerate': 'własne kody awaryjne',
    'PlatformSettingsController.getStaffSessionConfig': 'konfiguracja sesji panelu obsługi',
    'OpiekaZgloszenAdminController.oceny': 'STAFF widzi tylko własne oceny (filtr w serwisie)',
    'UsersAdminController.stop': 'koniec własnej impersonacji',
    'WnioskiAdminController.zloz': 'wniosek składa każdy (uprawnienie do złożenia sprawdza serwis)',
    'WnioskiAdminController.moje': 'własne wnioski',
    'WnioskiAdminController.anuluj': 'własny wniosek',
    'KbAdminController.categories': 'baza wiedzy do odczytu dla każdego pracownika (fala 1A)',
    'KbAdminController.articles': 'baza wiedzy do odczytu dla każdego pracownika (fala 1A)',
    'KbAdminController.article': 'baza wiedzy do odczytu dla każdego pracownika (fala 1A)',
    'KbAdminController.getCta': 'baza wiedzy do odczytu dla każdego pracownika (fala 1A)',
    'AiController.staffChat': 'asystent pracowników (wiedza STAFF z białej listy)',
    'AiController.supportSuggestion': 'szkic odpowiedzi; serwis sprawdza dostęp do zgłoszenia',
  };

  it('STAFF bez uprawnień wchodzi tylko na trasy z listy wyjątków (własne konto)', async () => {
    const wpuszczone: string[] = [];
    for (const t of TRASY) if (await wpuszcza(t, OPERATOR, [])) wpuszczone.push(`${t.kontroler}.${t.metoda}`);
    expect(wpuszczone.sort()).toEqual(Object.keys(BEZ_UPRAWNIENIA).sort());
  });

  /** D1 — akcje nieodwracalne i konfiguracja: STAFF nie wchodzi nawet z kompletem uprawnień. */
  const TYLKO_ADMIN: Record<string, string[] | '*'> = {
    // zakończenie i usunięcie usługi, odtworzenie na innym węźle
    SubscriptionsAdminController: ['zakonczIUsun', 'odtworzenieNaWezle', 'odtworzenieNaWezleLista', 'odtworzenieNaWezleStart'],
    // SSO do DA węzła
    ServersAdminController: ['createNodeSsoUrl'],
    // konfiguracja platformy (w tym wymuszenie 2FA zespołu, D10)
    PlatformSettingsAdminController: '*',
    MailSettingsAdminController: '*',
    AiUstawieniaAdminController: '*',
    // plany i ceny
    PlansAdminController: ['create', 'update', 'deactivate', 'usunTrwale', 'syncStripe', 'validateStripePrice'],
    AutoscalingAdminController: '*',
    VpsAdminController: '*',
    SslAdminController: ['ceny'],
    PartnersAdminController: ['updateConfig'],
    // zespół
    StaffRolesAdminController: ['create', 'update', 'remove', 'clone', 'createOperator', 'assign', 'setRoles', 'setActive'],
    // VPN
    VpnAdminController: '*',
    // publikacja dokumentów prawnych i wymuszona anonimizacja
    ComplianceAdminController: ['publish', 'forceAnonymize'],
  };

  it('akcje nieodwracalne i konfiguracja zostają tylko dla ADMIN-a (STAFF z kompletem uprawnień — 403)', async () => {
    const otwarte: string[] = [];
    const brakujace: string[] = [];
    for (const [kontroler, metody] of Object.entries(TYLKO_ADMIN)) {
      const trasy = TRASY.filter((t) => t.kontroler === kontroler && (metody === '*' || metody.includes(t.metoda)));
      if (metody === '*' ? trasy.length === 0 : trasy.length !== metody.length) brakujace.push(kontroler);
      for (const t of trasy) {
        if (await wpuszcza(t, OPERATOR, WSZYSTKIE)) otwarte.push(nazwa(t));
        expect(await wpuszcza(t, ADMIN)).toBe(true);
      }
    }
    expect(brakujace).toEqual([]);
    expect(otwarte).toEqual([]);
  });

  it('pulpit, menu i metryki — DASHBOARD_VIEW; błędy aplikacji — NODES_VIEW; blokady poczty — CUSTOMERS_VIEW', async () => {
    const t = (kontroler: string, metoda: string) => TRASY.find((x) => x.kontroler === kontroler && x.metoda === metoda)!;
    for (const [k, m, perm] of [
      ['AdminDashboardController', 'overview', 'DASHBOARD_VIEW'],
      ['AdminDashboardController', 'menu', 'DASHBOARD_VIEW'],
      ['BusinessMetricsAdminController', 'business', 'DASHBOARD_VIEW'],
      ['RuntimeErrorsController', 'list', 'NODES_VIEW'],
      ['OutboundCordonAdminController', 'list', 'CUSTOMERS_VIEW'],
    ] as const) {
      expect({ k, m, ok: await wpuszcza(t(k, m), OPERATOR, [perm]) }).toEqual({ k, m, ok: true });
      expect({ k, m, ok: await wpuszcza(t(k, m), OPERATOR, WSZYSTKIE.filter((p) => p !== perm)) }).toEqual({ k, m, ok: false });
    }
  });

  /**
   * Przegląd Fali 2A — wiedza AI zasila chatbota w panelu klienta (dokumenty CLIENT/ALL). Panel operatora otwiera
   * stronę „Wiedza AI” dla DASHBOARD_VIEW (L1, audytor, NOC, finanse), więc zapis musi wymagać KB_MANAGE jak artykuły.
   */
  it('wiedza AI: odczyt DASHBOARD_VIEW, zapis (dodanie, zmiana, usunięcie) tylko KB_MANAGE', async () => {
    const t = (metoda: string) => TRASY.find((x) => x.kontroler === 'AiKnowledgeAdminController' && x.metoda === metoda)!;
    for (const m of ['list', 'get']) expect({ m, ok: await wpuszcza(t(m), OPERATOR, ['DASHBOARD_VIEW']) }).toEqual({ m, ok: true });
    for (const m of ['create', 'update', 'remove']) {
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, WSZYSTKIE.filter((p) => p !== 'KB_MANAGE')) }).toEqual({ m, ok: false });
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, ['KB_MANAGE']) }).toEqual({ m, ok: true });
      expect(await wpuszcza(t(m), ADMIN)).toBe(true);
    }
  });
});

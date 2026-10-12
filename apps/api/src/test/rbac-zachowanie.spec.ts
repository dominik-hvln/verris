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
        'list',
        'exportCsv',
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
      // Weryfikacja 11.10 — lista usług w trybie odczytu jak karta; eksport CSV (dane osobowe) nadal nie.
      list: true,
      exportCsv: false,
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

  it('F3.5 (D2): cykl życia usługi — anulacja i cofnięcie od L2 i NOC; data odnowienia L4 (niżej wniosek); obietnica zapłaty L3', async () => {
    const cykl = TRASY.filter((t) => t.kontroler === 'CyklZyciaUslugiAdminController');
    expect(cykl.map((t) => t.metoda).sort()).toEqual(['anuluj', 'cofnijAnulacje', 'odwolajObietnice', 'ustawObietnice', 'zmienDateOdnowienia']);
    const wolno = async (rola: string) => {
      const out: Record<string, boolean> = {};
      for (const t of cykl) out[t.metoda] = await wpuszcza(t, OPERATOR, uprawnieniaRoli(rola));
      return out;
    };
    const w = (anulacja: boolean, data: boolean, obietnica: boolean) => ({
      anuluj: anulacja,
      cofnijAnulacje: anulacja,
      zmienDateOdnowienia: data,
      ustawObietnice: obietnica,
      odwolajObietnice: obietnica,
    });
    expect(await wolno('L1 Konsultant')).toEqual(w(false, false, false));
    expect(await wolno('L2 Specjalista techniczny')).toEqual(w(true, false, false));
    expect(await wolno('L3 Starszy specjalista')).toEqual(w(true, false, true));
    expect(await wolno('L4 Kierownik zmiany')).toEqual(w(true, true, true));
    expect(await wolno('Inżynier infrastruktury (NOC/DevOps)')).toEqual(w(true, false, false));
    // Finanse mają BILLING_MANAGE, ale nie zmieniają usług — data odnowienia wymaga obu uprawnień.
    expect(await wolno('Finanse i księgowość')).toEqual(w(false, false, false));
    // Przegląd F3.5 — zespół abuse ma SUBSCRIPTIONS_SUSPEND (zawiesza za nadużycie), ale „nie rusza rozliczeń”:
    // obietnica zapłaty to decyzja o należności, więc wymaga też SUBSCRIPTIONS_MANAGE (L3 ma oba).
    expect(await wolno('Nadużycia i bezpieczeństwo')).toEqual(w(false, false, false));
    expect(await wolno('Audytor (tylko podgląd)')).toEqual(w(false, false, false));
    for (const t of cykl) {
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['*', 'SUBSCRIPTIONS_MANAGE', 'BILLING_MANAGE', 'SUBSCRIPTIONS_SUSPEND'])).toBe(false);
    }
  });

  it('F3.5 (D2): dodatki obsługi — podgląd jak karta usługi (L1+, NOC); dodanie (koszt) tylko L4, niżej wniosek', async () => {
    const t = (m: string) => {
      const x = TRASY.find((r) => r.kontroler === 'DodatkiOperatoraAdminController' && r.metoda === m);
      expect(x, m).toBeDefined();
      return x!;
    };
    const w = async (rola: string) => ({ dodatki: await wpuszcza(t('dodatki'), OPERATOR, uprawnieniaRoli(rola)), dodaj: await wpuszcza(t('dodaj'), OPERATOR, uprawnieniaRoli(rola)) });
    expect(await w('L1 Konsultant')).toEqual({ dodatki: true, dodaj: false });
    expect(await w('L3 Starszy specjalista')).toEqual({ dodatki: true, dodaj: false });
    expect(await w('L4 Kierownik zmiany')).toEqual({ dodatki: true, dodaj: true });
    expect(await w('Inżynier infrastruktury (NOC/DevOps)')).toEqual({ dodatki: true, dodaj: false });
    expect(await w('Marketing')).toEqual({ dodatki: false, dodaj: false });
    expect(await wpuszcza(t('dodaj'), KLIENT, ['*', 'BILLING_MANAGE', 'SUBSCRIPTIONS_MANAGE'])).toBe(false);
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
    const odwracalne = ['hasloSkrzynki', 'hasloFtp', 'hasloBazy', 'ssl', 'php', 'kopia', 'skan', 'kwarantanna', 'przywrocZKwarantanny'];
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
    // Kolejka konta: podgląd od L2, usunięcie wiadomości (nieodwracalne) od L3 — to samo uprawnienie co blokada.
    expect(await wolno('L1 Konsultant', ['kolejka', 'wczytajKolejke', 'usunZKolejki'])).toEqual({ kolejka: false, wczytajKolejke: false, usunZKolejki: false });
    expect(await wolno('L2 Specjalista techniczny', ['kolejka', 'wczytajKolejke', 'usunZKolejki'])).toEqual({ kolejka: true, wczytajKolejke: true, usunZKolejki: false });
    expect(await wolno('L3 Starszy specjalista', ['kolejka', 'wczytajKolejke', 'usunZKolejki'])).toEqual({ kolejka: true, wczytajKolejke: true, usunZKolejki: true });
    // F3.1 reszta — limit wysyłki konta: odczyt od L2, zmiana od L3 (to samo uprawnienie co blokada).
    expect(await wolno('L1 Konsultant', ['limit', 'wczytajLimit', 'ustawLimit'])).toEqual({ limit: false, wczytajLimit: false, ustawLimit: false });
    expect(await wolno('L2 Specjalista techniczny', ['limit', 'wczytajLimit', 'ustawLimit'])).toEqual({ limit: true, wczytajLimit: true, ustawLimit: false });
    for (const rola of ['L3 Starszy specjalista', 'Nadużycia i bezpieczeństwo', 'Inżynier infrastruktury (NOC/DevOps)']) {
      expect({ rola, w: await wolno(rola, ['limit', 'wczytajLimit', 'ustawLimit']) }).toEqual({ rola, w: { limit: true, wczytajLimit: true, ustawLimit: true } });
    }
    expect(await wpuszcza(t('ustawLimit'), KLIENT, ['*', 'MAIL_SEND_BLOCK'])).toBe(false);
    expect(poczta.map((p) => p.metoda).sort()).toEqual(['kolejka', 'limit', 'stanWysylki', 'ustawLimit', 'usunZKolejki', 'wczytajKolejke', 'wczytajLimit', 'zablokuj', 'zwolnij']);
    // Sam podgląd kolejki nie daje blokady; samo NODES_MANAGE / ABUSE_MANAGE też nie.
    for (const m of blokada) {
      expect(await wpuszcza(t(m), OPERATOR, ['MAIL_QUEUE_VIEW', 'NODES_MANAGE', 'ABUSE_MANAGE', 'ACCOUNT_ACTIONS'])).toBe(false);
      expect(await wpuszcza(t(m), ADMIN)).toBe(true);
      expect(await wpuszcza(t(m), KLIENT, ['*', 'MAIL_SEND_BLOCK'])).toBe(false);
    }
  });

  it('F3.1 (D4): kolejka poczty CAŁEGO węzła (nagłówki wszystkich klientów) — tylko NOC i ADMIN', async () => {
    const trasy = TRASY.filter((t) => t.kontroler === 'KolejkaPocztyWezlaAdminController');
    expect(trasy.map((t) => t.metoda).sort()).toEqual(['stan', 'wczytaj', 'wypchnij']);
    for (const t of trasy) {
      expect(await wpuszcza(t, OPERATOR, uprawnieniaRoli('Inżynier infrastruktury (NOC/DevOps)'))).toBe(true);
      for (const rola of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo', 'Audytor (tylko podgląd)']) {
        expect({ t: nazwa(t), rola, w: await wpuszcza(t, OPERATOR, uprawnieniaRoli(rola)) }).toEqual({ t: nazwa(t), rola, w: false });
      }
      expect(await wpuszcza(t, OPERATOR, ['NODES_VIEW', 'NODES_MANAGE', 'MAIL_QUEUE_VIEW', 'MAIL_SEND_BLOCK'])).toBe(false);
      expect(await wpuszcza(t, ADMIN)).toBe(true);
    }
  });

  it('F3.1 reszta: nadawcy i odrzucenia węzła, RBL na żądanie — tylko NOC i ADMIN', async () => {
    const trasy = TRASY.filter((t) => t.kontroler === 'PocztaWezlaAdminController');
    expect(trasy.map((t) => t.metoda).sort()).toEqual(['rbl', 'statystyki', 'wczytajStatystyki']);
    for (const t of trasy) {
      expect(t.sciezka.startsWith('admin/servers/:id/poczta')).toBe(true);
      expect(await wpuszcza(t, OPERATOR, uprawnieniaRoli('Inżynier infrastruktury (NOC/DevOps)'))).toBe(true);
      for (const rola of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo', 'Audytor (tylko podgląd)']) {
        expect({ t: nazwa(t), rola, w: await wpuszcza(t, OPERATOR, uprawnieniaRoli(rola)) }).toEqual({ t: nazwa(t), rola, w: false });
      }
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['MAIL_QUEUE_NODE'])).toBe(false);
    }
  });

  it('F2.7 (D2/D8): domeny — odczyt od L1, operacje od L3, odnowienie na koszt Verris tylko L4 i ADMIN', async () => {
    const domeny = TRASY.filter((t) => t.kontroler === 'DomenyAdminController');
    const t = (m: string) => {
      const x = domeny.find((p) => p.metoda === m);
      if (!x) throw new Error(`brak trasy DomenyAdminController.${m}`);
      return x;
    };
    const odczyt = ['lista', 'zamowienia', 'karta', 'abonent'];
    const operacje = ['synchronizuj', 'blokada', 'kodEpp', 'serweryNazw', 'odnow', 'wycena', 'ponow', 'sprawdzTransfery'];
    const kosztVerris = ['odnowNaKosztVerris'];
    expect(domeny.map((x) => x.metoda).sort()).toEqual([...odczyt, ...operacje, ...kosztVerris].sort());
    const wolno = async (rola: string, metody: string[]) => {
      const out: Record<string, boolean> = {};
      for (const m of metody) out[m] = await wpuszcza(t(m), OPERATOR, uprawnieniaRoli(rola));
      return out;
    };
    const wszystkie = (metody: string[], v: boolean) => Object.fromEntries(metody.map((m) => [m, v]));
    for (const rola of ['L1 Konsultant', 'L2 Specjalista techniczny', 'Audytor (tylko podgląd)']) {
      expect({ rola, ...(await wolno(rola, odczyt)) }).toEqual({ rola, ...wszystkie(odczyt, true) });
      expect({ rola, ...(await wolno(rola, [...operacje, ...kosztVerris])) }).toEqual({ rola, ...wszystkie([...operacje, ...kosztVerris], false) });
    }
    expect(await wolno('L3 Starszy specjalista', [...odczyt, ...operacje])).toEqual(wszystkie([...odczyt, ...operacje], true));
    expect(await wolno('L3 Starszy specjalista', kosztVerris)).toEqual(wszystkie(kosztVerris, false));
    expect(await wolno('L4 Kierownik zmiany', [...odczyt, ...operacje, ...kosztVerris])).toEqual(wszystkie([...odczyt, ...operacje, ...kosztVerris], true));
    // Finanse (BILLING_MANAGE bez DOMAINS_MANAGE) i NOC — bez operacji na domenach.
    for (const rola of ['Finanse i księgowość', 'Inżynier infrastruktury (NOC/DevOps)']) {
      expect({ rola, ...(await wolno(rola, [...operacje, ...kosztVerris])) }).toEqual({ rola, ...wszystkie([...operacje, ...kosztVerris], false) });
    }
    for (const x of domeny) expect(await wpuszcza(x, ADMIN)).toBe(true);
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

  it('pulpit i menu — DASHBOARD_VIEW; metryki biznesowe — METRICS_VIEW (11.10); błędy aplikacji — NODES_VIEW; blokady poczty — CUSTOMERS_VIEW', async () => {
    const t = (kontroler: string, metoda: string) => TRASY.find((x) => x.kontroler === kontroler && x.metoda === metoda)!;
    for (const [k, m, perm] of [
      ['AdminDashboardController', 'overview', 'DASHBOARD_VIEW'],
      ['AdminDashboardController', 'menu', 'DASHBOARD_VIEW'],
      ['BusinessMetricsAdminController', 'business', 'METRICS_VIEW'],
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

/**
 * F2.5 — helpdesk: notatki wewnętrzne, zgłoszenie w imieniu klienta, tagi, eskalacja i jej cofnięcie, flaga
 * ryzyka, kroki runbooka — TICKETS_MANAGE (L1 i wyżej); skrzynka i lista tagów — TICKETS_VIEW. Klient (USER)
 * nie wchodzi na żadną z tych tras (sprawdza to test ogólny wyżej).
 */
describe('F2.5 — trasy helpdesku', () => {
  const t = (metoda: string) => {
    const x = TRASY.find((r) => r.kontroler === 'TicketsController' && r.metoda === metoda);
    expect(x, metoda).toBeDefined();
    return x!;
  };
  const L1 = [...ROLE_SYSTEMOWE.find((r) => r.name === 'L1 Konsultant')!.permissions];
  const MARKETING = [...ROLE_SYSTEMOWE.find((r) => r.name === 'Marketing')!.permissions];
  const ZAPIS = ['adminAddNote', 'adminCreateOnBehalf', 'adminUndoEscalation', 'adminSetTags', 'adminRunbookSteps', 'adminEscalateTicket', 'adminSetRiskFlag'];
  const ODCZYT = ['adminListTags', 'adminFindAll'];

  it('zapis — TICKETS_MANAGE: L1 tak, sam TICKETS_VIEW nie, Marketing nie', async () => {
    for (const m of ZAPIS) {
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, L1) }).toEqual({ m, ok: true });
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, ['TICKETS_VIEW']) }).toEqual({ m, ok: false });
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, MARKETING) }).toEqual({ m, ok: false });
      expect({ m, ok: await wpuszcza(t(m), KLIENT, ['*']) }).toEqual({ m, ok: false });
    }
  });

  it('odczyt — TICKETS_VIEW', async () => {
    for (const m of ODCZYT) {
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, ['TICKETS_VIEW']) }).toEqual({ m, ok: true });
      expect({ m, ok: await wpuszcza(t(m), OPERATOR, MARKETING) }).toEqual({ m, ok: false });
    }
  });
});

/**
 * D11 (10.10) — tablica migracji: odczyt i wszystkie działania (etap, terminy, przypisanie, checklista, kontakty,
 * raport do klienta, sprawdzenie DNS) — MIGRATIONS_MANAGE: L2 (support migracji) i wyżej oraz NOC; L1 (helpdesk),
 * audytor i Marketing nie. Klient (USER) nie wchodzi (test ogólny wyżej).
 */
describe('D11 — tablica migracji', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const METODY = ['lista', 'obsluga', 'etap', 'ustawienia', 'checklista', 'kontakt', 'podgladRaportu', 'wyslijRaport', 'sprawdzDns'];
  const trasy = () => {
    const t = TRASY.filter((x) => x.kontroler === 'TablicaMigracjiController');
    expect(t.map((x) => x.metoda).sort()).toEqual([...METODY].sort());
    return t;
  };

  it('L2, L3, L4 i NOC — tak; L1, audytor i Marketing — nie; sam MIGRATIONS_MANAGE wystarcza', async () => {
    for (const t of trasy()) {
      for (const r of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Inżynier infrastruktury (NOC/DevOps)']) {
        expect({ m: t.metoda, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m: t.metoda, r, ok: true });
      }
      for (const r of ['L1 Konsultant', 'Audytor (tylko podgląd)', 'Marketing']) {
        expect({ m: t.metoda, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m: t.metoda, r, ok: false });
      }
      expect(await wpuszcza(t, OPERATOR, ['MIGRATIONS_MANAGE'])).toBe(true);
      expect(await wpuszcza(t, ADMIN)).toBe(true);
    }
  });
});

/**
 * F2.6 (10.10) — zasoby i diagnoza „508”: karta usługi (faulty, inody, wolne SQL, 5xx) — ACCOUNT_DIAGNOSTICS_VIEW
 * (L2 i wyżej, NOC, abuse); konta przekraczające limity we flocie / na węźle — NODES_VIEW (NOC, L2+, audytor).
 */
describe('F2.6 — zasoby i diagnoza 508', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const trasa = (kontroler: string, metoda: string) => {
    const t = TRASY.find((x) => x.kontroler === kontroler && x.metoda === metoda);
    if (!t) throw new Error(`brak trasy ${kontroler}.${metoda}`);
    return t;
  };

  it('karta usługi: odczyt i „wczytaj z serwera” — L2, L3, L4, NOC; L1, audytor i Marketing — nie', async () => {
    for (const m of ['zasoby', 'odczytajZasoby']) {
      const t = trasa('KontoKlientaAdminController', m);
      for (const r of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Inżynier infrastruktury (NOC/DevOps)']) {
        expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: true });
      }
      for (const r of ['L1 Konsultant', 'Audytor (tylko podgląd)', 'Marketing']) {
        expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: false });
      }
      expect(await wpuszcza(t, OPERATOR, ['NODES_VIEW', 'CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE'])).toBe(false);
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(false);
    }
  });

  it('flota i węzeł: przekroczenia limitów — NODES_VIEW (NOC, audytor, L2+); L1 i Marketing — nie', async () => {
    const t = trasa('ServersAdminController', 'przekroczenia');
    expect(t.sciezka).toBe('admin/servers/przekroczenia');
    for (const r of ['Inżynier infrastruktury (NOC/DevOps)', 'Audytor (tylko podgląd)', 'L2 Specjalista techniczny']) {
      expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: true });
    }
    for (const r of ['L1 Konsultant', 'Marketing']) expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: false });
    expect(await wpuszcza(t, OPERATOR, ['ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(false);
    expect(await wpuszcza(t, ADMIN)).toBe(true);
    expect(await wpuszcza(t, KLIENT, ['NODES_VIEW'])).toBe(false);
  });
});

/**
 * F3.2 (D5, 10.10) — bezpieczeństwo węzła. Blokady IP: na karcie usługi „Zablokowało mi IP” — IP_UNBLOCK (L2+, NOC)
 * albo IP_BLOCKS_NODE; lista blokad węzła, dowolne IP i biała lista — tylko IP_BLOCKS_NODE (NOC) i ADMIN.
 */
describe('F3.2 — bezpieczeństwo węzła', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const trasy = (kontroler: string, metody: string[]) => {
    const t = TRASY.filter((x) => x.kontroler === kontroler);
    expect(t.map((x) => x.metoda).sort()).toEqual([...metody].sort());
    return t;
  };

  it('karta usługi „Zablokowało mi IP”: L2, L3, L4, NOC — tak; L1, audytor, abuse, Marketing — nie', async () => {
    for (const t of trasy('BlokadyIpKontaAdminController', ['stan', 'sprawdz', 'odblokuj'])) {
      for (const r of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Inżynier infrastruktury (NOC/DevOps)']) {
        expect({ m: t.metoda, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m: t.metoda, r, ok: true });
      }
      for (const r of ['L1 Konsultant', 'Audytor (tylko podgląd)', 'Marketing']) {
        expect({ m: t.metoda, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m: t.metoda, r, ok: false });
      }
      expect(await wpuszcza(t, OPERATOR, ['IP_BLOCKS_NODE'])).toBe(true);
      expect(await wpuszcza(t, OPERATOR, ['ACCOUNT_DIAGNOSTICS_VIEW', 'ACCOUNT_ACTIONS'])).toBe(false);
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['IP_UNBLOCK'])).toBe(false);
    }
  });

  it('malware floty: ACCOUNT_DIAGNOSTICS_VIEW (L2+, NOC, abuse); L1, audytor, Marketing — nie', async () => {
    const t = TRASY.find((x) => x.kontroler === 'ServersAdminController' && x.metoda === 'malware')!;
    expect(t.sciezka).toBe('admin/servers/malware');
    for (const r of ['L2 Specjalista techniczny', 'L4 Kierownik zmiany', 'Inżynier infrastruktury (NOC/DevOps)', 'Nadużycia i bezpieczeństwo']) {
      expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: true });
    }
    for (const r of ['L1 Konsultant', 'Audytor (tylko podgląd)', 'Marketing']) expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: false });
    expect(await wpuszcza(t, ADMIN)).toBe(true);
  });

  it('kwarantanna i przywrócenie z karty usługi: ACCOUNT_ACTIONS (L2+, abuse); L1, NOC, audytor — nie', async () => {
    for (const m of ['kwarantanna', 'przywrocZKwarantanny']) {
      const t = TRASY.find((x) => x.kontroler === 'KontoKlientaAkcjeAdminController' && x.metoda === m)!;
      for (const r of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'Nadużycia i bezpieczeństwo']) {
        expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: true });
      }
      for (const r of ['L1 Konsultant', 'Inżynier infrastruktury (NOC/DevOps)', 'Audytor (tylko podgląd)']) {
        expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: false });
      }
      expect(await wpuszcza(t, ADMIN)).toBe(true);
    }
  });

  it('trafienia WAF konta (odczyt i wczytanie): ACCOUNT_DIAGNOSTICS_VIEW (L2+, NOC); zmiana trybu WAF — tylko ADMIN', async () => {
    for (const m of ['trafieniaWaf', 'wczytajTrafieniaWaf']) {
      const t = TRASY.find((x) => x.kontroler === 'KontoKlientaAdminController' && x.metoda === m)!;
      expect(t.sciezka).toBe('admin/subscriptions/:id/konto/waf');
      for (const r of ['L2 Specjalista techniczny', 'L3 Starszy specjalista', 'Inżynier infrastruktury (NOC/DevOps)']) {
        expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: true });
      }
      for (const r of ['L1 Konsultant', 'Audytor (tylko podgląd)', 'Marketing']) expect({ m, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m, r, ok: false });
    }
    const zmianaTrybu = TRASY.find((x) => x.kontroler === 'WafAdminController' && x.metoda === 'setMode')!;
    expect(await wpuszcza(zmianaTrybu, OPERATOR, [...STAFF_PERMISSION_KEYS])).toBe(false);
    expect(await wpuszcza(zmianaTrybu, ADMIN)).toBe(true);
  });

  it('blokady IP węzła (lista, dowolne IP, biała lista): tylko NOC i ADMIN; L2–L4 z IP_UNBLOCK — nie', async () => {
    for (const t of trasy('BlokadyIpWezlaAdminController', ['stan', 'wczytaj', 'odblokuj', 'bialaLista'])) {
      expect(t.sciezka.startsWith('admin/servers/:id/blokady-ip')).toBe(true);
      expect({ m: t.metoda, ok: await wpuszcza(t, OPERATOR, rola('Inżynier infrastruktury (NOC/DevOps)')) }).toEqual({ m: t.metoda, ok: true });
      for (const r of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo', 'Audytor (tylko podgląd)']) {
        expect({ m: t.metoda, r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ m: t.metoda, r, ok: false });
      }
      expect(await wpuszcza(t, ADMIN)).toBe(true);
    }
  });
});

/**
 * F3.4 — usługi i logi węzła: NOC (NODE_SERVICES) — stan, logi, restart usług pomocniczych i uruchomienie stojącej
 * usługi wspólnej; restart działającej usługi wspólnej — tylko ADMIN (NODE_SERVICES_RESTART_SHARED jest ADMIN_ONLY),
 * NOC dostaje WYMAGA_WNIOSKU. L1–L4, abuse, audytor — nic.
 */
describe('F3.4 — usługi i logi węzła', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const trasy = TRASY.filter((t) => t.kontroler === 'UslugiWezlaAdminController');
  const NOC = rola('Inżynier infrastruktury (NOC/DevOps)');

  it('trasy pod admin/servers/:id/uslugi', () => {
    expect(trasy.map((t) => t.metoda).sort()).toEqual(['log', 'restart', 'restartWspolnej', 'sprawdz', 'stan']);
    for (const t of trasy) expect(t.sciezka.startsWith('admin/servers/:id/uslugi')).toBe(true);
  });

  it('NOC: stan, sprawdzenie, logi, restart — tak; restart działającej usługi wspólnej — nie (wniosek); ADMIN — wszystko', async () => {
    for (const t of trasy) {
      expect({ m: t.metoda, ok: await wpuszcza(t, OPERATOR, NOC) }).toEqual({ m: t.metoda, ok: t.metoda !== 'restartWspolnej' });
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, [...STAFF_PERMISSION_KEYS])).toBe(false);
    }
  });

  it('żadna rola systemowa (ani wszystkie naraz) nie restartuje działającej usługi wspólnej', async () => {
    const t = trasy.find((x) => x.metoda === 'restartWspolnej')!;
    expect(await wpuszcza(t, OPERATOR, [...new Set(ROLE_SYSTEMOWE.flatMap((r) => r.permissions))])).toBe(false);
  });

  it('L1–L4, abuse, audytor, Finanse — żadnej trasy', async () => {
    for (const r of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany', 'Nadużycia i bezpieczeństwo', 'Audytor (tylko podgląd)', 'Finanse i księgowość']) {
      for (const t of trasy) expect({ r, m: t.metoda, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, m: t.metoda, ok: false });
    }
  });
});

/**
 * F3.8 — komunikacja operacyjna: mail z szablonu — kto rozmawia z klientami (CUSTOMERS_VIEW + TICKETS_MANAGE: L1+,
 * Finanse, Sprzedaż, IOD, abuse), NOC i Marketing nie; komunikat do klientów węzła/planu — L4 (SERVICE_NOTICES_SEND)
 * i ADMIN; baner incydentów — każda rola systemowa.
 */
describe('F3.8 — komunikacja operacyjna', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const t = (k: string) => TRASY.filter((x) => x.kontroler === k);

  it('mail z szablonu (admin/users/:id/mail-obslugi): L1–L4, Finanse, Sprzedaż, IOD, abuse — tak; NOC, Marketing, Audytor — nie', async () => {
    const [m] = t('MailDoKlientaAdminController');
    expect(m.sciezka).toBe('admin/users/:id/mail-obslugi');
    for (const r of ['L1 Konsultant', 'L4 Kierownik zmiany', 'Finanse i księgowość', 'Sprzedaż i partnerzy', 'Inspektor ochrony danych (IOD)', 'Nadużycia i bezpieczeństwo']) {
      expect({ r, ok: await wpuszcza(m, OPERATOR, rola(r)) }).toEqual({ r, ok: true });
    }
    for (const r of ['Inżynier infrastruktury (NOC/DevOps)', 'Marketing', 'Audytor (tylko podgląd)']) expect({ r, ok: await wpuszcza(m, OPERATOR, rola(r)) }).toEqual({ r, ok: false });
    expect(await wpuszcza(m, ADMIN)).toBe(true);
    expect(await wpuszcza(m, KLIENT, [...STAFF_PERMISSION_KEYS])).toBe(false);
  });

  it('komunikaty serwisowe: tylko L4 i ADMIN (wszystkie trasy)', async () => {
    const trasy = t('KomunikatySerwisoweAdminController');
    expect(trasy.map((x) => x.metoda).sort()).toEqual(['lista', 'podglad', 'widok', 'zatrzymaj', 'zlec']);
    for (const x of trasy) {
      expect({ m: x.metoda, ok: await wpuszcza(x, OPERATOR, rola('L4 Kierownik zmiany')) }).toEqual({ m: x.metoda, ok: true });
      for (const r of ['L1 Konsultant', 'L3 Starszy specjalista', 'Inżynier infrastruktury (NOC/DevOps)', 'Marketing', 'Finanse i księgowość']) {
        expect({ m: x.metoda, r, ok: await wpuszcza(x, OPERATOR, rola(r)) }).toEqual({ m: x.metoda, r, ok: false });
      }
      expect(await wpuszcza(x, ADMIN)).toBe(true);
    }
  });

  it('baner incydentów: każda rola systemowa tak; operator bez uprawnień i klient — nie', async () => {
    const [b] = t('StatusObslugiAdminController');
    for (const r of ROLE_SYSTEMOWE) expect({ r: r.name, ok: await wpuszcza(b, OPERATOR, [...r.permissions]) }).toEqual({ r: r.name, ok: true });
    expect(await wpuszcza(b, OPERATOR, [])).toBe(false);
    expect(await wpuszcza(b, KLIENT, [...STAFF_PERMISSION_KEYS])).toBe(false);
  });
});

/** F3.9 — pulpity per rola: obsługa (TICKETS_VIEW), NOC (NODES_VIEW), finanse (BILLING_VIEW); klient — nic. */
describe('F3.9 — pulpity per rola', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const t = (m: string) => TRASY.find((x) => x.kontroler === 'PulpityRolAdminController' && x.metoda === m)!;
  it.each([
    ['obsluga', ['L1 Konsultant', 'Inżynier infrastruktury (NOC/DevOps)', 'Finanse i księgowość'], ['Marketing']],
    ['noc', ['Inżynier infrastruktury (NOC/DevOps)', 'L2 Specjalista techniczny', 'Audytor (tylko podgląd)'], ['L1 Konsultant', 'Finanse i księgowość', 'Marketing']],
    ['finanse', ['Finanse i księgowość', 'L1 Konsultant', 'Audytor (tylko podgląd)'], ['Inżynier infrastruktury (NOC/DevOps)', 'Marketing']],
  ])('%s: tak dla %j, nie dla %j', async (m, tak, nie) => {
    expect(t(m).sciezka).toBe(`admin/pulpit/${m}`);
    for (const r of tak) expect({ r, ok: await wpuszcza(t(m), OPERATOR, rola(r)) }).toEqual({ r, ok: true });
    for (const r of nie) expect({ r, ok: await wpuszcza(t(m), OPERATOR, rola(r)) }).toEqual({ r, ok: false });
    expect(await wpuszcza(t(m), ADMIN)).toBe(true);
    expect(await wpuszcza(t(m), KLIENT, [...STAFF_PERMISSION_KEYS])).toBe(false);
  });
});

/** F3.3 — kopie floty: admin i NOC (NODES_VIEW, jak lista węzłów); L1 i Marketing — nie. */
describe('F3.3 — kopie floty', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];

  it('GET admin/servers/kopie: NODES_VIEW (NOC, L2+, audytor); L1 i Marketing — nie; klient — nie', async () => {
    const t = TRASY.find((x) => x.kontroler === 'ServersAdminController' && x.metoda === 'kopie')!;
    expect(t.sciezka).toBe('admin/servers/kopie');
    for (const r of ['Inżynier infrastruktury (NOC/DevOps)', 'L2 Specjalista techniczny', 'Audytor (tylko podgląd)']) {
      expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: true });
    }
    for (const r of ['L1 Konsultant', 'Marketing']) expect({ r, ok: await wpuszcza(t, OPERATOR, rola(r)) }).toEqual({ r, ok: false });
    expect(await wpuszcza(t, ADMIN)).toBe(true);
    expect(await wpuszcza(t, KLIENT, ['NODES_VIEW'])).toBe(false);
  });
});

/**
 * F3.6 — rozliczenia: odczyt (nieudane płatności, ruchy portfela, przypomnienia i zawieszenia) od BILLING_VIEW — L1,
 * Finanse, Audytor; pieniądze (wpłata przelewem, korekta salda, ponowienie auto-doładowania) — BILLING_MANAGE (L4,
 * Finanse). NOC, Marketing i zespół abuse rozliczeń nie widzą.
 */
describe('F3.6 — rozliczenia operatora', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const trasy = TRASY.filter((t) => t.kontroler === 'RozliczeniaAdminController');
  // K4 — proformy: lista i PDF to odczyt (BILLING_VIEW), wystawienie i anulowanie — pieniądze (BILLING_MANAGE).
  const ODCZYT = ['nieudanePlatnosci', 'windykacja', 'windykacjaKlienta', 'ruchyPortfela', 'proformyKlienta', 'proformaPdf'];
  const ZMIANY = ['ponowAutoDoladowanie', 'korektaSalda', 'zaksiegujPrzelew', 'wystawProforme', 'anulujProforme'];
  const wynik = async (uprawnienia: string[]) => Object.fromEntries(await Promise.all(trasy.map(async (t) => [t.metoda, await wpuszcza(t, OPERATOR, uprawnienia)] as const)));
  const oczekiwane = (odczyt: boolean, zmiany: boolean) => Object.fromEntries([...ODCZYT.map((m) => [m, odczyt]), ...ZMIANY.map((m) => [m, zmiany])]);

  it('trasy pod admin/rozliczenia', () => {
    expect(trasy.map((t) => t.metoda).sort()).toEqual([...ODCZYT, ...ZMIANY].sort());
    expect(trasy.every((t) => t.sciezka.startsWith('admin/rozliczenia/'))).toBe(true);
  });

  it('L1, L2, L3 i Audytor: odczyt tak, pieniądze nie; L4 i Finanse: wszystko; NOC, Marketing, abuse: nic', async () => {
    for (const r of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'Audytor (tylko podgląd)']) {
      expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: oczekiwane(true, false) });
    }
    for (const r of ['L4 Kierownik zmiany', 'Finanse i księgowość']) expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: oczekiwane(true, true) });
    for (const r of ['Inżynier infrastruktury (NOC/DevOps)', 'Marketing', 'Nadużycia i bezpieczeństwo']) {
      expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: oczekiwane(false, false) });
    }
    for (const t of trasy) {
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['*', 'BILLING_VIEW', 'BILLING_MANAGE'])).toBe(false);
    }
  });
});

/** F3.7 (OE-25, D1) — progi SLA zgłoszeń to konfiguracja platformy: odczyt i zapis tylko ADMIN, także dla L4. */
describe('F3.7 — progi SLA zgłoszeń', () => {
  it('GET/PUT admin/support/sla: ADMIN tak; operator nawet z kompletem uprawnień zgłoszeń — nie; klient — nie', async () => {
    const trasy = TRASY.filter((t) => t.kontroler === 'OpiekaZgloszenAdminController' && ['progiSla', 'zapiszProgiSla'].includes(t.metoda));
    expect(trasy.map((t) => t.sciezka).sort()).toEqual(['admin/support/sla', 'admin/support/sla']);
    const l4 = [...ROLE_SYSTEMOWE.find((r) => r.name === 'L4 Kierownik zmiany')!.permissions];
    for (const t of trasy) {
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, OPERATOR, [...l4, 'TICKETS_VIEW', 'TICKETS_MANAGE'])).toBe(false);
      expect(await wpuszcza(t, KLIENT, ['*'])).toBe(false);
    }
  });
});

/**
 * F3.7 (OE-19, OE-20) — „Poczta bez klienta”: odczyt i „Pokaż” plik — TICKETS_VIEW; decyzje i blokady — TICKETS_MANAGE.
 * Audyt Fali 3 — maile z abuse@ i blokada całej domeny dodatkowo ABUSE_MANAGE albo ADMIN: sprawdza serwis per wpis
 * (test/integration/poczta-przychodzaca.int-spec.ts), bo granica zależy od rodzaju wpisu, nie od trasy.
 */
describe('F3.7 — poczta przychodząca do zgłoszeń', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const trasy = TRASY.filter((t) => t.kontroler === 'PocztaPrzychodzacaAdminController');
  const ODCZYT = ['lista', 'blokady', 'plik'];
  const ZMIANY = ['przypisz', 'odrzuc', 'zablokuj', 'odblokuj'];
  const wynik = async (uprawnienia: string[]) => Object.fromEntries(await Promise.all(trasy.map(async (t) => [t.metoda, await wpuszcza(t, OPERATOR, uprawnienia)] as const)));
  const oczekiwane = (odczyt: boolean, zmiany: boolean) => Object.fromEntries([...ODCZYT.map((m) => [m, odczyt]), ...ZMIANY.map((m) => [m, zmiany])]);

  it('trasy pod admin/poczta-zgloszen (poza tickets/admin/:id)', () => {
    expect(trasy.map((t) => t.metoda).sort()).toEqual([...ODCZYT, ...ZMIANY].sort());
    expect(trasy.every((t) => t.sciezka.startsWith('admin/poczta-zgloszen'))).toBe(true);
  });

  it('L1–L4: wszystko; Audytor i NOC: tylko odczyt; Marketing: nic; sam TICKETS_VIEW — bez decyzji', async () => {
    for (const r of ['L1 Konsultant', 'L2 Specjalista techniczny', 'L3 Starszy specjalista', 'L4 Kierownik zmiany']) {
      expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: oczekiwane(true, true) });
    }
    for (const r of ['Audytor (tylko podgląd)', 'Inżynier infrastruktury (NOC/DevOps)']) {
      expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: oczekiwane(true, false) });
    }
    expect(await wynik(['TICKETS_VIEW'])).toEqual(oczekiwane(true, false));
    expect(await wynik(rola('Marketing'))).toEqual(oczekiwane(false, false));
    for (const t of trasy) {
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['*', 'TICKETS_VIEW', 'TICKETS_MANAGE'])).toBe(false);
    }
  });
});

/**
 * F3.7 cz. 2 — praca na zgłoszeniu: makra i akcje masowe — TICKETS_MANAGE (L1+); lista makr, kandydaci do scalenia
 * i „kto teraz pisze” — TICKETS_VIEW; scalenie (nieodwracalne, D2) — TICKETS_MERGE (L3+), L1/L2 przez wniosek;
 * raporty obsługi — TICKETS_REPORTS (L4) i ADMIN.
 */
describe('F3.7 — makra, scalanie, obecność, akcje masowe, raporty', () => {
  const rola = (n: string) => [...ROLE_SYSTEMOWE.find((r) => r.name === n)!.permissions];
  const METODY = ['adminBulk', 'adminMacros', 'adminApplyMacro', 'adminMergeCandidates', 'adminMerge', 'adminPresence', 'adminLeave'];
  const trasy = [
    ...TRASY.filter((t) => t.kontroler === 'TicketsController' && METODY.includes(t.metoda)),
    ...TRASY.filter((t) => t.kontroler === 'OpiekaZgloszenAdminController' && t.metoda === 'raport'),
  ];
  const wynik = async (uprawnienia: string[]) => Object.fromEntries(await Promise.all(trasy.map(async (t) => [t.metoda, await wpuszcza(t, OPERATOR, uprawnienia)] as const)));
  const w = (o: { odczyt: boolean; zmiany: boolean; scal: boolean; raport: boolean }) => ({
    adminMacros: o.odczyt, adminMergeCandidates: o.odczyt, adminPresence: o.odczyt, adminLeave: o.odczyt,
    adminBulk: o.zmiany, adminApplyMacro: o.zmiany, adminMerge: o.scal, raport: o.raport,
  });

  it('trasy pod tickets/admin/* i admin/support/raporty', () => {
    expect(trasy.map((t) => t.sciezka).sort()).toEqual(
      ['admin/support/raporty', 'tickets/admin/:id/makro', 'tickets/admin/:id/obecnosc', 'tickets/admin/:id/obecnosc', 'tickets/admin/:id/scal', 'tickets/admin/:id/scalanie', 'tickets/admin/makra', 'tickets/admin/masowo'].sort(),
    );
  });

  it('L1/L2: makra i masowe tak, scalenie nie (wniosek); L3: scalenie; L4: raporty; Audytor i NOC: odczyt; Marketing: nic', async () => {
    for (const r of ['L1 Konsultant', 'L2 Specjalista techniczny']) expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: w({ odczyt: true, zmiany: true, scal: false, raport: false }) });
    expect(await wynik(rola('L3 Starszy specjalista'))).toEqual(w({ odczyt: true, zmiany: true, scal: true, raport: false }));
    expect(await wynik(rola('L4 Kierownik zmiany'))).toEqual(w({ odczyt: true, zmiany: true, scal: true, raport: true }));
    for (const r of ['Audytor (tylko podgląd)', 'Inżynier infrastruktury (NOC/DevOps)']) {
      expect({ r, w: await wynik(rola(r)) }).toEqual({ r, w: w({ odczyt: true, zmiany: false, scal: false, raport: false }) });
    }
    expect(await wynik(rola('Marketing'))).toEqual(w({ odczyt: false, zmiany: false, scal: false, raport: false }));
    // Samo TICKETS_MERGE bez obsługi zgłoszeń nie scala (komplet jak we wniosku TICKET_MERGE).
    expect((await wynik(['TICKETS_MERGE'])).adminMerge).toBe(false);
    for (const t of trasy) {
      expect(await wpuszcza(t, ADMIN)).toBe(true);
      expect(await wpuszcza(t, KLIENT, ['*', 'TICKETS_VIEW', 'TICKETS_MANAGE', 'TICKETS_MERGE', 'TICKETS_REPORTS'])).toBe(false);
    }
  });
});

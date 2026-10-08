import { ExecutionContext, ForbiddenException, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { STAFF_PERMISSIONS_ANY_KEY, STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { ROLE_SYSTEMOWE } from '../staff-roles/role-systemowe.js';

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

function plikiKontrolerow(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...plikiKontrolerow(p));
    else if (n.endsWith('.controller.ts') && /@Controller\(\s*['"`](admin|staff|tickets)/.test(readFileSync(p, 'utf-8'))) out.push(p);
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
        if (!TRASA_OPERATORA.test(pelna)) continue;
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
    // Trasy klienta z tych samych kontrolerów (np. `tickets/:id`) nie są trasami operatora.
    expect(sciezki.filter((s) => !TRASA_OPERATORA.test(s))).toEqual([]);
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
    expect(odrzucone).toEqual([]);
  });

  it('trasy tylko dla administratora odrzucają operatora nawet z kompletem uprawnień', async () => {
    const reset = TRASY.find((t) => t.kontroler === 'UsersAdminController' && t.metoda === 'resetPassword');
    expect(reset).toBeDefined();
    expect(await wpuszcza(reset!, OPERATOR, ['CUSTOMERS_VIEW', 'CUSTOMERS_MANAGE'])).toBe(false);
    expect(await wpuszcza(reset!, ADMIN)).toBe(true);
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

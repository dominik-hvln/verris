import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RolesGuard } from '../common/guards/roles.guard';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator';

/**
 * X-10 — RBAC sprawdzany ZACHOWANIEM, nie metadanymi.
 *
 * Wcześniejsze specy czytały Reflect.getMetadata(ROLES_KEY) — dowodziły, że ktoś
 * napisał dekorator, nie że strażnik odmawia. Tu każdą trasę każdego kontrolera
 * `admin/*` przepuszczamy przez PRAWDZIWE RolesGuard i StaffPermissionsGuard
 * (z prawdziwym Reflectorem) i sprawdzamy wynik dla konta klienta, operatora bez
 * uprawnień, operatora z uprawnieniami i administratora.
 */
// archiver 8 to czysty ESM — ts-jest go nie przetłumaczy; strażnik czyta tylko metadane tras.
jest.mock('archiver', () => ({}));

type Uzytkownik = { userId: string; role: 'USER' | 'STAFF' | 'ADMIN' };
type Trasa = { kontroler: string; klasa: Function; metoda: string; handler: Function; sciezka: string };

const SRC = resolve(__dirname, '..');

function plikiKontrolerow(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...plikiKontrolerow(p));
    else if (n.endsWith('.controller.ts') && /@Controller\(\s*['"`]admin/.test(readFileSync(p, 'utf-8'))) out.push(p);
  }
  return out;
}

function trasyAdmina(): Trasa[] {
  const out: Trasa[] = [];
  for (const plik of plikiKontrolerow(SRC)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(plik) as Record<string, unknown>;
    for (const [nazwa, klasa] of Object.entries(mod)) {
      if (typeof klasa !== 'function') continue;
      const sciezka = Reflect.getMetadata(PATH_METADATA, klasa) as string | undefined;
      if (typeof sciezka !== 'string' || !sciezka.startsWith('admin')) continue;
      for (const metoda of Object.getOwnPropertyNames(klasa.prototype)) {
        const handler = (klasa.prototype as Record<string, unknown>)[metoda];
        if (metoda === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        out.push({ kontroler: nazwa, klasa, metoda, handler, sciezka });
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

const TRASY = trasyAdmina();
const KLIENT: Uzytkownik = { userId: 'c', role: 'USER' };
const OPERATOR: Uzytkownik = { userId: 's', role: 'STAFF' };
const ADMIN: Uzytkownik = { userId: 'a', role: 'ADMIN' };
const nazwa = (t: Trasa) => `${t.kontroler}.${t.metoda} (${t.sciezka})`;

describe('X-10 — RBAC paneli operatorskich sprawdzany zachowaniem', () => {
  it('znaleziono trasy admin/* do sprawdzenia (strażnik nie jest pusty)', () => {
    expect(TRASY.length).toBeGreaterThan(100);
  });

  it('konto klienta (USER) nie wchodzi na ŻADNĄ trasę admin/*', async () => {
    const wpuszczone: string[] = [];
    for (const t of TRASY) if (await wpuszcza(t, KLIENT, ['*'])) wpuszczone.push(nazwa(t));
    expect(wpuszczone).toEqual([]);
  });

  it('operator bez żadnych uprawnień wchodzi tylko tam, gdzie trasa nie wymaga uprawnienia', async () => {
    const wpuszczoneMimoWymogu: string[] = [];
    for (const t of TRASY) {
      const wymagane = new Reflector().getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [t.handler, t.klasa]);
      if (!wymagane?.length) continue;
      if (await wpuszcza(t, OPERATOR, [])) wpuszczoneMimoWymogu.push(nazwa(t));
    }
    expect(wpuszczoneMimoWymogu).toEqual([]);
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

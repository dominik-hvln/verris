import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { KbAdminController } from './kb.admin.controller.js';

/**
 * B2 — baza wiedzy to treść pokazywana klientom i indeksowana przez asystenta. Zapis tylko ADMIN
 * albo STAFF z KB_MANAGE; odczyt dla każdego STAFF bez zmian. Sprawdzamy prawdziwym strażnikiem
 * na metadanych kontrolera (bez kontenera DI).
 */
type Metoda = Exclude<keyof KbAdminController, 'authorOf'>;
const METODY = Object.getOwnPropertyNames(KbAdminController.prototype).filter(
  (m) => m !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, (KbAdminController.prototype as never)[m]) !== undefined,
) as Metoda[];
// RequestMethod: 0 = GET
const ZAPIS = METODY.filter((m) => Reflect.getMetadata(METHOD_METADATA, (KbAdminController.prototype as never)[m]) !== 0);
const ODCZYT = METODY.filter((m) => !ZAPIS.includes(m));

function wpuszcza(metoda: Metoda, user: { role: string; userId: string }, uprawnienia: string[]) {
  const prisma = { user: { findUnique: async () => ({ staffRole: { id: 'r', name: 'r', permissions: uprawnienia } }) } };
  const guard = new StaffPermissionsGuard(new Reflector(), prisma as never);
  const ctx = {
    getHandler: () => (KbAdminController.prototype as never)[metoda],
    getClass: () => KbAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(ctx).catch((e) => {
    if (e instanceof ForbiddenException) return false;
    throw e;
  });
}

const STAFF = { role: 'STAFF', userId: 'op' };

describe('KbAdminController — B2: zapis tylko z KB_MANAGE', () => {
  it('kontroler ma trasy zapisu i odczytu (sanity), strażnik uprawnień wpięty na klasie', () => {
    expect(ZAPIS.length).toBeGreaterThanOrEqual(7);
    expect(ODCZYT.length).toBeGreaterThanOrEqual(4);
    expect(Reflect.getMetadata('__guards__', KbAdminController)).toContain(StaffPermissionsGuard);
  });

  it('STAFF bez KB_MANAGE (np. L1) → 403 na każdym POST/PATCH/DELETE', async () => {
    for (const m of ZAPIS) expect({ m, ok: await wpuszcza(m, STAFF, ['TICKETS_VIEW', 'TICKETS_MANAGE']) }).toEqual({ m, ok: false });
  });

  it('STAFF z KB_MANAGE i ADMIN — zapis dozwolony', async () => {
    for (const m of ZAPIS) {
      expect(await wpuszcza(m, STAFF, ['KB_MANAGE'])).toBe(true);
      expect(await wpuszcza(m, { role: 'ADMIN', userId: 'a' }, [])).toBe(true);
    }
  });

  it('odczyt bez zmian: STAFF bez żadnego uprawnienia czyta', async () => {
    for (const m of ODCZYT) expect({ m, ok: await wpuszcza(m, STAFF, []) }).toEqual({ m, ok: true });
  });
});

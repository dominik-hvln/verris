import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { MigrationsStaffController } from './migrations.staff.controller.js';

/**
 * PB-45 — „Migracja za klienta” (założenie i test dostępów) zachowaniem strażników: klient nie wchodzi,
 * operator tylko z MIGRATIONS_MANAGE, administrator zawsze. Trasy `staff/*` nie łapie rbac-zachowanie (admin/*).
 */
type U = { userId: string; role: 'USER' | 'STAFF' | 'ADMIN' };

async function wpuszcza(metoda: 'utworzZaKlienta' | 'testDostepowZaKlienta', user: U, uprawnienia: string[] = []): Promise<boolean> {
  const handler = MigrationsStaffController.prototype[metoda] as unknown as () => unknown;
  const ctx = {
    getHandler: () => handler,
    getClass: () => MigrationsStaffController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  const prisma = { user: { findUnique: async () => ({ staffRole: { permissions: uprawnienia } }) } };
  const straznicy = [
    ...((Reflect.getMetadata(GUARDS_METADATA, MigrationsStaffController) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
  ];
  for (const S of straznicy) {
    try {
      if (S === RolesGuard && !new RolesGuard(reflector).canActivate(ctx)) return false;
      if (S === StaffPermissionsGuard && !(await new StaffPermissionsGuard(reflector, prisma as never).canActivate(ctx))) return false;
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
  }
  return true;
}

describe.each(['utworzZaKlienta', 'testDostepowZaKlienta'] as const)('PB-45 — %s', (metoda) => {
  it('klient (USER) nie wchodzi nawet z kompletem uprawnień', async () => {
    expect(await wpuszcza(metoda, { userId: 'c', role: 'USER' }, ['*'])).toBe(false);
  });
  it('operator bez MIGRATIONS_MANAGE nie wchodzi, z nim — tak', async () => {
    expect(await wpuszcza(metoda, { userId: 's', role: 'STAFF' }, ['TICKETS_MANAGE', 'CUSTOMERS_VIEW'])).toBe(false);
    expect(await wpuszcza(metoda, { userId: 's', role: 'STAFF' }, ['MIGRATIONS_MANAGE'])).toBe(true);
  });
  it('administrator wchodzi', async () => {
    expect(await wpuszcza(metoda, { userId: 'a', role: 'ADMIN' })).toBe(true);
  });
});

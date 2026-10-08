import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { StaffRolesAdminController } from './staff-roles.admin.controller.js';

/** Decyzja właściciela 08.10: zmiany ról i operatorów tylko ADMIN (STAFF nawet z STAFF_MANAGE — tylko podgląd). */
describe('StaffRolesAdminController — zmiany tylko dla administratora', () => {
  const reflector = new Reflector();
  const proto = StaffRolesAdminController.prototype as unknown as Record<string, unknown>;
  const role = (m: string) =>
    reflector.getAllAndOverride<Role[]>(ROLES_KEY, [proto[m] as () => void, StaffRolesAdminController]);

  it.each(['create', 'update', 'remove', 'clone', 'createOperator', 'assign', 'setRoles', 'setActive'])(
    '%s → tylko ADMIN',
    (m) => {
      expect(role(m)).toEqual([Role.ADMIN]);
    },
  );

  it.each(['catalog', 'list', 'operators', 'activity'])('%s (podgląd) → ADMIN i STAFF z STAFF_MANAGE', (m) => {
    expect(role(m)).toEqual([Role.ADMIN, Role.STAFF]);
  });
});

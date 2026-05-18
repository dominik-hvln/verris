import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UsersAdminController } from './users.admin.controller';

describe('UsersAdminController (RBAC metadata)', () => {
  it('class allows STAFF and ADMIN (profil 360°, diagnostyka, tickety BOK)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersAdminController);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('customerProfile inherits class roles (no method override)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersAdminController.prototype.customerProfile)).toBeUndefined();
  });

  it('runDnsTls inherits class roles', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersAdminController.prototype.runDnsTls)).toBeUndefined();
  });

  it('Sprint 4 / R-04 — operational and password routes are ADMIN-only', () => {
    for (const key of [
      'operationalDetail',
      'patchOperational',
      'changeEmail',
      'resetPassword',
    ] as const) {
      const roles = Reflect.getMetadata(ROLES_KEY, UsersAdminController.prototype[key]);
      expect(roles).toEqual([Role.ADMIN]);
    }
  });
});

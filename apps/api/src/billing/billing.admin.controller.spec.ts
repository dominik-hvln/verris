import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { BillingAdminController } from './billing.admin.controller.js';

/** B1 — zmiana kodu promocyjnego ma te same drzwi co jego tworzenie: ADMIN albo STAFF z PROMO_MANAGE. */
const meta = (klucz: keyof BillingAdminController, key: string): unknown =>
  Reflect.getMetadata(key, BillingAdminController.prototype[klucz] as object);

describe('BillingAdminController — kody promocyjne (metadane RBAC)', () => {
  it('PATCH kodu: ADMIN + STAFF z PROMO_MANAGE, z wpiętym StaffPermissionsGuard', () => {
    expect((meta('updatePromo', ROLES_KEY) as Role[]).slice().sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
    expect(meta('updatePromo', STAFF_PERMISSIONS_KEY)).toEqual(['PROMO_MANAGE']);
    expect(meta('updatePromo', '__guards__')).toContain(StaffPermissionsGuard);
    expect(meta('updatePromo', STAFF_PERMISSIONS_KEY)).toEqual(meta('createPromo', STAFF_PERMISSIONS_KEY));
  });
});

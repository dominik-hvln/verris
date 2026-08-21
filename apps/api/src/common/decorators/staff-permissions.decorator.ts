import { SetMetadata } from '@nestjs/common';
import type { StaffPermission } from '../../staff-roles/staff-permissions.catalog';

export const STAFF_PERMISSIONS_KEY = 'staffPermissions';

/**
 * RBAC — wymaga, by zalogowany operator miał WSZYSTKIE wskazane uprawnienia.
 * ADMIN ma dostęp zawsze (bypass w StaffPermissionsGuard).
 */
export const StaffPerm = (...perms: StaffPermission[]) => SetMetadata(STAFF_PERMISSIONS_KEY, perms);

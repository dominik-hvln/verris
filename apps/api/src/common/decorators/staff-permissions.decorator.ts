import { SetMetadata } from '@nestjs/common';
import type { StaffPermission } from '../../staff-roles/staff-permissions.catalog.js';

export const STAFF_PERMISSIONS_KEY = 'staffPermissions';
export const STAFF_PERMISSIONS_ANY_KEY = 'staffPermissionsAny';

/**
 * RBAC — wymaga, by zalogowany operator miał WSZYSTKIE wskazane uprawnienia.
 * ADMIN ma dostęp zawsze (bypass w StaffPermissionsGuard).
 */
export const StaffPerm = (...perms: StaffPermission[]) => SetMetadata(STAFF_PERMISSIONS_KEY, perms);

/**
 * L1-KARTA — RBAC „którekolwiek z”: wystarcza JEDNO ze wskazanych uprawnień. Tylko na metodzie: zastępuje
 * wtedy @StaffPerm klasy (np. odczyt karty usługi: podgląd klientów ALBO zarządzanie usługami).
 * ADMIN ma dostęp zawsze, jak przy @StaffPerm.
 */
export const StaffPermAny = (...perms: [StaffPermission, ...StaffPermission[]]) => SetMetadata(STAFF_PERMISSIONS_ANY_KEY, perms);

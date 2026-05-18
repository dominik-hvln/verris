import { SetMetadata } from '@nestjs/common';
import { CustomerPermission } from '@verris/database';

export const CUSTOMER_PERMISSIONS_KEY = 'customer_permissions';

export const RequireCustomerPermissions = (...permissions: CustomerPermission[]) =>
  SetMetadata(CUSTOMER_PERMISSIONS_KEY, permissions);

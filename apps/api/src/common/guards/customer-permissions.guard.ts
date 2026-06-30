import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomerPermission } from '@verris/database';
import {
  CUSTOMER_PERMISSIONS_KEY,
} from '../decorators/customer-permissions.decorator';

@Injectable()
export class CustomerPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      method?: string;
      route?: { path?: string };
      path?: string;
      user?: {
        customerOwnerId?: string | null;
        customerPermissions?: CustomerPermission[];
      };
    }>();
    const user = req.user;
    if (!user?.customerOwnerId) return true;

    const explicit = this.reflector.getAllAndOverride<CustomerPermission[]>(
      CUSTOMER_PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    const required =
      explicit ??
      inferCustomerRoutePermissions(req.method ?? 'GET', req.route?.path ?? req.path ?? '');
    if (required.length === 0) return true;
    const granted = new Set(user.customerPermissions ?? []);
    return required.every((permission) => granted.has(permission));
  }
}

/** Exported for unit tests (route → permission inference). */
export function inferCustomerRoutePermissions(
  method: string,
  path: string,
): CustomerPermission[] {
  const read = method.toUpperCase() === 'GET';
  const normalized = path.toLowerCase();
  if (normalized.includes('billing')) {
    return [read ? CustomerPermission.BILLING_READ : CustomerPermission.BILLING_MANAGE];
  }
  // Hosting tools live under /services/... — match before generic "services".
  if (normalized.includes('hosting-dns')) {
    return [CustomerPermission.DNS_MANAGE];
  }
  if (
    normalized.includes('hosting-email') ||
    normalized.includes('hosting-autoresponders') ||
    normalized.includes('hosting-catchall') ||
    normalized.includes('hosting-spamfilter')
  ) {
    return [CustomerPermission.EMAIL_MANAGE];
  }
  if (normalized.includes('file-manager') || normalized.includes('hosting-files')) {
    return [CustomerPermission.FILES_MANAGE];
  }
  if (normalized.includes('subscriptions') || normalized.includes('services')) {
    return [read ? CustomerPermission.SERVICES_READ : CustomerPermission.SERVICES_MANAGE];
  }
  if (normalized.includes('domains')) {
    return [read ? CustomerPermission.DOMAINS_READ : CustomerPermission.DOMAINS_MANAGE];
  }
  if (normalized.includes('tickets')) {
    return [read ? CustomerPermission.TICKETS_READ : CustomerPermission.TICKETS_MANAGE];
  }
  if (normalized.includes('users/me') || normalized.includes('settings')) {
    return read ? [] : [CustomerPermission.SETTINGS_MANAGE];
  }
  return [];
}

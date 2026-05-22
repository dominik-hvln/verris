import { CustomerPermission } from '@verris/database';
import { inferCustomerRoutePermissions } from './customer-permissions.guard';

describe('CustomerPermissionsGuard inferPermissions', () => {
  const infer = inferCustomerRoutePermissions;

  it('requires DNS_MANAGE for hosting-dns under services path', () => {
    expect(
      infer('GET', '/services/sub-1/hosting-dns'),
    ).toEqual([CustomerPermission.DNS_MANAGE]);
  });

  it('requires EMAIL_MANAGE for hosting-email under services path', () => {
    expect(
      infer('POST', '/services/sub-1/hosting-email/mailboxes'),
    ).toEqual([CustomerPermission.EMAIL_MANAGE]);
  });

  it('requires FILES_MANAGE for file-manager under services path', () => {
    expect(
      infer('GET', '/services/sub-1/file-manager'),
    ).toEqual([CustomerPermission.FILES_MANAGE]);
  });

  it('falls back to SERVICES_READ for generic services listing', () => {
    expect(infer('GET', '/services')).toEqual([
      CustomerPermission.SERVICES_READ,
    ]);
  });

  it('requires BILLING_MANAGE for billing mutations', () => {
    expect(infer('POST', '/billing/wallet/topup')).toEqual([
      CustomerPermission.BILLING_MANAGE,
    ]);
  });
});

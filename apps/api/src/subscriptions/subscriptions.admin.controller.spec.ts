import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { SubscriptionsAdminController } from './subscriptions.admin.controller';

describe('SubscriptionsAdminController (RBAC metadata)', () => {
  it('defaults class-level roles to ADMIN only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('list() allows STAFF via method override', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.list);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('detail() allows STAFF via method override', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.detail);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('suspend() has no method override — only class-level ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SubscriptionsAdminController.prototype.suspend);
    expect(roles).toBeUndefined();
  });
});

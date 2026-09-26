import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { TicketsController } from './tickets.controller.js';

describe('TicketsController (RBAC metadata)', () => {
  it('adminFindAll requires STAFF or ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.adminFindAll);
    expect(roles?.sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });
});

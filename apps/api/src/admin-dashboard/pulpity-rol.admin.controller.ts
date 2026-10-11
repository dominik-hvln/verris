import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PulpityRolService } from './pulpity-rol.service.js';

/**
 * F3.9 (OP-07) — pulpity per rola: obsługa (TICKETS_VIEW — moje zgłoszenia liczone dla zalogowanego), NOC (NODES_VIEW),
 * finanse (BILLING_VIEW). Pulpit administratora to admin/dashboard/overview (DASHBOARD_VIEW). Tylko odczyt.
 */
@Controller('admin/pulpit')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class PulpityRolAdminController {
  constructor(private readonly pulpity: PulpityRolService) {}

  @Get('obsluga')
  @StaffPerm('TICKETS_VIEW')
  obsluga(@CurrentUser() op: { userId: string }) {
    return this.pulpity.obsluga(op.userId);
  }

  @Get('noc')
  @StaffPerm('NODES_VIEW')
  noc() {
    return this.pulpity.noc();
  }

  @Get('finanse')
  @StaffPerm('BILLING_VIEW')
  finanse(@CurrentUser() op: { userId: string; role: string }) {
    return this.pulpity.finanse(op);
  }
}

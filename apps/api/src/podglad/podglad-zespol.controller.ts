import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { PodgladService } from './podglad.service.js';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
export class PodgladZespolController {
  constructor(private readonly podglad: PodgladService) {}

  /** Adres podglądu dla zespołu — wynik testu strony po przeniesieniu, przed zmianą DNS przez klienta. */
  @Get(':id/podglad')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW')
  adres(@Param('id') id: string) {
    return this.podglad.adresDlaZespolu(id);
  }
}

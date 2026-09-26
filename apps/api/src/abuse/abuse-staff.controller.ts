import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AbuseService } from './abuse.service.js';
import { DecyzjaNaduzyciaDto } from './abuse.dto.js';

/** N-13 — kolejka dla obsługi (uprawnienie ABUSE_MANAGE). */
@Controller('staff/abuse')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.STAFF, Role.ADMIN)
@StaffPerm('ABUSE_MANAGE')
export class AbuseStaffController {
  constructor(private readonly abuse: AbuseService) {}

  @Get()
  lista(@Query('status') status?: string) {
    const ok = ['NEW', 'IN_REVIEW', 'ACTION_TAKEN', 'REJECTED'];
    return this.abuse.lista(status && ok.includes(status) ? status : undefined);
  }

  @Get(':id')
  szczegoly(@Param('id') id: string) {
    return this.abuse.szczegoly(id);
  }

  @Post(':id/decision')
  decyzja(@Param('id') id: string, @Body() dto: DecyzjaNaduzyciaDto, @CurrentUser() user: { userId: string }) {
    return this.abuse.decyzja(id, dto, user.userId);
  }
}

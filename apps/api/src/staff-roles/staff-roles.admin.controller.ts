import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StaffRolesService } from './staff-roles.service';

type Authed = { userId: string; principalUserId?: string; role: string };

/** RBAC — zarządzanie rolami/działami i przypisaniami (wymaga STAFF_MANAGE). */
@Controller('admin/staff-roles')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('STAFF_MANAGE')
export class StaffRolesAdminController {
  constructor(private readonly svc: StaffRolesService) {}

  @Get('catalog')
  catalog() {
    return this.svc.catalog();
  }

  @Get()
  list() {
    return this.svc.listRoles();
  }

  @Post()
  create(@Body() body: { name: string; description?: string; permissions: string[] }) {
    return this.svc.createRole(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; description?: string; permissions?: string[] }) {
    return this.svc.updateRole(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.deleteRole(id);
  }

  @Get('operators')
  operators() {
    return this.svc.listOperators();
  }

  @Post('operators')
  createOperator(@Body() body: { email: string; firstName?: string; lastName?: string; roleId?: string | null }) {
    return this.svc.createOperator(body);
  }

  @Post('operators/:userId/assign')
  assign(@Param('userId') userId: string, @Body() body: { roleId: string | null }) {
    return this.svc.assignRole(userId, body.roleId ?? null);
  }

  @Post('operators/:userId/active')
  setActive(@Param('userId') userId: string, @Body() body: { active: boolean }) {
    return this.svc.setOperatorActive(userId, Boolean(body.active));
  }

  @Get('activity')
  activity(@Query('operatorId') operatorId?: string) {
    return this.svc.operatorActivity({ operatorId });
  }
}

/** Uprawnienia zalogowanego operatora — dostępne dla każdego STAFF/ADMIN (bez STAFF_MANAGE). */
@Controller('staff/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class StaffMeController {
  constructor(private readonly svc: StaffRolesService) {}

  @Get('access')
  access(@CurrentUser() user: Authed) {
    return this.svc.myAccess(user);
  }
}

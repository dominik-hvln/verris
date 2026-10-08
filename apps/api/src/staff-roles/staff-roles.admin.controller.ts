import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { StaffRolesService } from './staff-roles.service.js';
import {
  AktywnoscOperatoraDto,
  KlonRoliDto,
  NowyOperatorDto,
  PrzypisanieRoliDto,
  RolaObslugiDto,
  RoleOperatoraDto,
  ZmianaRoliObslugiDto,
} from './staff-roles.dto.js';

type Authed = { userId: string; principalUserId?: string; role: string };

/** Aktor zmiany (przy impersonacji — principal); zakres zmian liczy serwis (STAFF tylko w granicach własnych uprawnień). */
const aktor = (u: Authed) => ({ userId: u.principalUserId ?? u.userId, role: u.role });

/**
 * RBAC — zarządzanie rolami/działami i przypisaniami. Podgląd: STAFF_MANAGE; każda ZMIANA (role, operatorzy,
 * przypisania, aktywność) tylko ADMIN — decyzja właściciela 08.10 (zarządzanie pracownikami i rolami należy do
 * administratora). Ograniczenia zakresu w serwisie zostają jako drugi bezpiecznik.
 */
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
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: Authed, @Body() body: RolaObslugiDto) {
    return this.svc.createRole(body, aktor(user));
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: Authed, @Param('id') id: string, @Body() body: ZmianaRoliObslugiDto) {
    return this.svc.updateRole(id, body, aktor(user));
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: Authed, @Param('id') id: string) {
    return this.svc.deleteRole(id, aktor(user));
  }

  /** PB-47 — rola systemowa nie jest edytowalna; zmiany robi się na kopii. */
  @Post(':id/clone')
  @Roles(Role.ADMIN)
  clone(@CurrentUser() user: Authed, @Param('id') id: string, @Body() body: KlonRoliDto) {
    return this.svc.cloneRole(id, body, aktor(user));
  }

  @Get('operators')
  operators() {
    return this.svc.listOperators();
  }

  @Post('operators')
  @Roles(Role.ADMIN)
  createOperator(@CurrentUser() user: Authed, @Body() body: NowyOperatorDto) {
    return this.svc.createOperator(body, aktor(user));
  }

  @Post('operators/:userId/assign')
  @Roles(Role.ADMIN)
  assign(@CurrentUser() user: Authed, @Param('userId') userId: string, @Body() body: PrzypisanieRoliDto) {
    return this.svc.assignRole(userId, body.roleId ?? null, aktor(user));
  }

  /** PB-47 — pełna lista ról operatora (uprawnienia = suma). */
  @Post('operators/:userId/roles')
  @Roles(Role.ADMIN)
  setRoles(@CurrentUser() user: Authed, @Param('userId') userId: string, @Body() body: RoleOperatoraDto) {
    return this.svc.setOperatorRoles(userId, body.roleIds, aktor(user));
  }

  @Post('operators/:userId/active')
  @Roles(Role.ADMIN)
  setActive(@CurrentUser() user: Authed, @Param('userId') userId: string, @Body() body: AktywnoscOperatoraDto) {
    return this.svc.setOperatorActive(userId, Boolean(body.active), aktor(user));
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

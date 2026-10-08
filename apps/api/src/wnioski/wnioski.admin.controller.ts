import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { WnioskiService, type Operator } from './wnioski.service.js';
import { AkceptujWniosekDto, HistoriaWnioskowQueryDto, OdrzucWniosekDto, ZlozWniosekDto } from './wnioski.dto.js';

interface AuthedUser {
  userId: string;
  role: string;
  principalUserId?: string;
}

const operator = (u: AuthedUser): Operator => ({ userId: u.principalUserId ?? u.userId, role: u.role });

/**
 * PB-48 — wnioski o operację wymagającą wyższego uprawnienia.
 * Złożenie, „moje” i wycofanie — każdy operator (STAFF/ADMIN); serwis sam odrzuca wniosek, gdy wnioskujący ma
 * uprawnienie (wykonuje bezpośrednio). Lista do decyzji, historia i decyzje — REQUESTS_APPROVE (ADMIN zawsze);
 * uprawnienie samej operacji serwis sprawdza w chwili decyzji.
 */
@Controller('admin/wnioski')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class WnioskiAdminController {
  constructor(private readonly wnioski: WnioskiService) {}

  @Post()
  @HttpCode(201)
  zloz(@CurrentUser() u: AuthedUser, @Body() dto: ZlozWniosekDto) {
    return this.wnioski.zloz(operator(u), dto);
  }

  @Get('moje')
  moje(@CurrentUser() u: AuthedUser) {
    return this.wnioski.moje(operator(u));
  }

  @Get('do-decyzji')
  @StaffPerm('REQUESTS_APPROVE')
  doDecyzji(@CurrentUser() u: AuthedUser) {
    return this.wnioski.doDecyzjiLista(operator(u));
  }

  @Get('historia')
  @StaffPerm('REQUESTS_APPROVE')
  historia(@CurrentUser() u: AuthedUser, @Query() q: HistoriaWnioskowQueryDto) {
    return this.wnioski.historia(operator(u), q);
  }

  @Post(':id/akceptuj')
  @HttpCode(200)
  @StaffPerm('REQUESTS_APPROVE')
  akceptuj(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Body() dto: AkceptujWniosekDto) {
    return this.wnioski.akceptuj(id, operator(u), dto.uwaga);
  }

  @Post(':id/odrzuc')
  @HttpCode(200)
  @StaffPerm('REQUESTS_APPROVE')
  odrzuc(@CurrentUser() u: AuthedUser, @Param('id') id: string, @Body() dto: OdrzucWniosekDto) {
    return this.wnioski.odrzuc(id, operator(u), dto.powod);
  }

  @Post(':id/anuluj')
  @HttpCode(200)
  anuluj(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    return this.wnioski.anuluj(id, operator(u));
  }
}

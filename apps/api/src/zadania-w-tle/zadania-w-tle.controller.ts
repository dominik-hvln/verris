import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ZadaniaWTleService } from './zadania-w-tle.service.js';

/**
 * F2.8 (OJ-01) — System → Zadania w tle w panelu operatora. Odczyt: ADMIN i STAFF z podglądem floty (NODES_VIEW,
 * jak „Błędy aplikacji”). Ręczne uruchomienie: tylko ADMIN i tylko zadania z białej listy (zadania-w-tle.ts).
 */
@Controller('admin/zadania-w-tle')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('NODES_VIEW')
export class ZadaniaWTleController {
  constructor(private readonly zadania: ZadaniaWTleService) {}

  @Get()
  lista(@CurrentUser() user: { role: Role }) {
    return this.zadania.stan(user.role === Role.ADMIN);
  }

  @Post(':klucz/uruchom')
  @HttpCode(202)
  @Roles(Role.ADMIN)
  uruchom(@Param('klucz') klucz: string, @CurrentUser() user: { userId: string }) {
    return this.zadania.uruchomRecznie(klucz, user.userId);
  }
}

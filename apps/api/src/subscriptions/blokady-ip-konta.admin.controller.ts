import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PowodOperatoraDto } from './dto/akcje-konta.dto.js';
import { BlokadyIpKontaService } from './blokady-ip-konta.service.js';

export class SprawdzIpDto {
  @IsString() @MaxLength(45) ip!: string;
}

export class OdblokujIpKontaDto extends PowodOperatoraDto {
  @IsString() @MaxLength(45) ip!: string;
}

type Aktor = { userId: string; role: string };

/**
 * F3.2 (D5) — „Zablokowało mi IP” na karcie usługi: adresy klienta (logowania, zgłoszenia), sprawdzenie i odblokowanie
 * na węźle konta. IP_UNBLOCK (L2+) — tylko adresy klienta ze zgłoszeniem; IP_BLOCKS_NODE (NOC) i ADMIN — dowolny adres.
 * Reguły i dziennik: blokady-ip-konta.service.ts.
 */
@Controller('admin/subscriptions/:id/konto/blokady-ip')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class BlokadyIpKontaAdminController {
  constructor(private readonly blokady: BlokadyIpKontaService) {}

  @Get()
  @StaffPermAny('IP_UNBLOCK', 'IP_BLOCKS_NODE')
  stan(@Param('id') id: string, @CurrentUser() actor: Aktor) {
    return this.blokady.stan(id, actor.userId, actor.role);
  }

  @Post('sprawdz')
  @StaffPermAny('IP_UNBLOCK', 'IP_BLOCKS_NODE')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:konto-blokady-ip' })
  sprawdz(@Param('id') id: string, @Body() b: SprawdzIpDto, @CurrentUser() actor: Aktor) {
    return this.blokady.sprawdz(id, actor.userId, actor.role, b.ip);
  }

  @Post('odblokuj')
  @StaffPermAny('IP_UNBLOCK', 'IP_BLOCKS_NODE')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:konto-blokady-ip-odblokuj' })
  odblokuj(@Param('id') id: string, @Body() b: OdblokujIpKontaDto, @CurrentUser() actor: Aktor) {
    return this.blokady.odblokuj({ subscriptionId: id, operatorUserId: actor.userId, operatorRole: actor.role, powod: b.powod, zgloszenie: b.zgloszenie }, b.ip);
  }
}

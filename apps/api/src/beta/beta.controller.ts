import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { BetaService } from './beta.service.js';

export class ZaproszenieDoTestowDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}

export class KrokBetaDto {
  @IsString() @MaxLength(20) krokId!: string;
  @IsBoolean() zrobione!: boolean;
}

export class UwagaBetaDto {
  @IsString() @MaxLength(20) scenariuszId!: string;
  // Limit treści (2000 znaków) pilnuje serwis — po przycięciu białych znaków, z czytelnym komunikatem.
  @IsString() @MaxLength(4000) tekst!: string;
}

/** PB-26 — zaproszenia i lista testerów (panel admina). */
@Controller('admin/beta')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('PROMO_MANAGE')
export class BetaAdminController {
  constructor(private readonly beta: BetaService) {}

  @Get('invites')
  lista() {
    return this.beta.lista();
  }

  @Post('invites')
  @HttpCode(201)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:beta-invite' })
  zapros(@Body() dto: ZaproszenieDoTestowDto, @CurrentUser() actor: { userId: string }) {
    return this.beta.zapros(dto, actor.userId);
  }

  @Post('invites/:id/revoke')
  @HttpCode(200)
  wycofaj(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: { userId: string }) {
    return this.beta.wycofaj(id, actor.userId);
  }
}

/** PB-26 — czy zalogowany klient jest testerem (temat zgłoszeń „Testy (beta)”). */
@Controller('me/beta')
@UseGuards(JwtAuthGuard)
export class MeBetaController {
  constructor(private readonly beta: BetaService) {}

  @Get()
  async moj(@CurrentUser() user: { userId: string }) {
    return { tester: await this.beta.czyTester(user.userId) };
  }

  /** Strona „Testy (beta)” — odhaczone kroki scenariuszy i uwagi. */
  @Get('postep')
  postep(@CurrentUser() user: { userId: string }) {
    return this.beta.postep(user.userId);
  }

  @Put('postep/krok')
  @RateLimit({ limit: 600, windowMs: 60 * 60 * 1000, scope: 'beta:postep' })
  krok(@Body() dto: KrokBetaDto, @CurrentUser() user: { userId: string }) {
    return this.beta.ustawKrok(user.userId, dto.krokId, dto.zrobione);
  }

  @Put('postep/uwaga')
  @RateLimit({ limit: 600, windowMs: 60 * 60 * 1000, scope: 'beta:postep' })
  uwaga(@Body() dto: UwagaBetaDto, @CurrentUser() user: { userId: string }) {
    return this.beta.ustawUwage(user.userId, dto.scenariuszId, dto.tekst);
  }
}

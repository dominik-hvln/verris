import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { BetaService } from './beta.service';

export class ZaproszenieDoTestowDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
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
}

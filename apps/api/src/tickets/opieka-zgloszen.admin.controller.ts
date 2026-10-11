import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { OpiekaZgloszenService, type RodzajAuto } from './opieka-zgloszen.service.js';
import { SLA_MAX_GODZIN } from './sla-zgloszen.js';

class UstawienieAutoDto {
  @IsBoolean()
  wlaczone!: boolean;

  @IsString() @MaxLength(2000)
  tresc!: string;
}

class AutoWiadomosciDto {
  @IsOptional() @ValidateNested() @Type(() => UstawienieAutoDto)
  POTWIERDZENIE?: UstawienieAutoDto;

  @IsOptional() @ValidateNested() @Type(() => UstawienieAutoDto)
  ZAJMUJE_SIE?: UstawienieAutoDto;

  @IsOptional() @ValidateNested() @Type(() => UstawienieAutoDto)
  WCIAZ_PRACUJEMY?: UstawienieAutoDto;

  @IsOptional() @ValidateNested() @Type(() => UstawienieAutoDto)
  PODZIEKOWANIE?: UstawienieAutoDto;
}

class GodzinySlaDto {
  @IsInt() @Min(1) @Max(SLA_MAX_GODZIN) URGENT!: number;
  @IsInt() @Min(1) @Max(SLA_MAX_GODZIN) HIGH!: number;
  @IsInt() @Min(1) @Max(SLA_MAX_GODZIN) NORMAL!: number;
  @IsInt() @Min(1) @Max(SLA_MAX_GODZIN) LOW!: number;
}

class ProgiSlaDto {
  @ValidateNested() @Type(() => GodzinySlaDto)
  odpowiedz!: GodzinySlaDto;

  @ValidateNested() @Type(() => GodzinySlaDto)
  rozwiazanie!: GodzinySlaDto;
}

/** PB-37 — treści automatycznych wiadomości (admin) i oceny opiekunów (admin: wszyscy, obsługa: swoje). */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpiekaZgloszenAdminController {
  constructor(private readonly opieka: OpiekaZgloszenService) {}

  @Get('auto-messages')
  @Roles(Role.ADMIN)
  autoWiadomosci() {
    return this.opieka.widokUstawien();
  }

  @Put('auto-messages')
  @Roles(Role.ADMIN)
  zapiszAutoWiadomosci(@Body() dto: AutoWiadomosciDto, @CurrentUser() user: { userId: string }) {
    return this.opieka.zapiszUstawienia(dto as Partial<Record<RodzajAuto, UstawienieAutoDto>>, user.userId);
  }

  /** F3.7 (OE-25) — progi SLA per priorytet; konfiguracja platformy — tylko ADMIN (D1). */
  @Get('sla')
  @Roles(Role.ADMIN)
  progiSla() {
    return this.opieka.progiSla();
  }

  @Put('sla')
  @Roles(Role.ADMIN)
  zapiszProgiSla(@Body() dto: ProgiSlaDto, @CurrentUser() user: { userId: string }) {
    return this.opieka.zapiszProgiSla(dto, user.userId);
  }

  @Get('ratings')
  @Roles(Role.STAFF, Role.ADMIN)
  oceny(@Query('days') days: string | undefined, @CurrentUser() user: { userId: string; role: string }) {
    const dni = Math.min(365, Math.max(1, Number(days) || 30));
    return this.opieka.ocenyAgentow(dni, user.role === 'ADMIN' ? undefined : user.userId);
  }
}

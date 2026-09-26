import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BillingInterval, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { WarunkiIndywidualneService } from './warunki-indywidualne.service.js';

class PowodDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  powod!: string;
}

class NowaUslugaDto extends PowodDto {
  @IsUUID()
  planId!: string;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  individualPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  autoscalingDiscountPct?: number;
}

class WarunkiDto extends PowodDto {
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  individualPrice!: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  autoscalingDiscountPct!: number;
}

class RozliczeniePozaDto extends PowodDto {
  @IsBoolean()
  wlaczone!: boolean;
}

function data(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Niepoprawna data.');
  return d;
}

interface Operator {
  userId: string;
  actorUserId?: string;
}

/**
 * PB-27 / PB-28 — indywidualne warunki klienta: usługa zakładana przez operatora
 * z własną ceną, rabat na autoskalowanie, rozliczenie konta poza Verris.
 * Admin albo pracownik z uprawnieniem CUSTOM_TERMS_MANAGE.
 */
@Controller('admin/custom-terms')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOM_TERMS_MANAGE')
export class WarunkiIndywidualneAdminController {
  constructor(private readonly warunki: WarunkiIndywidualneService) {}

  @Get('user/:userId')
  podglad(@Param('userId') userId: string, @Query('od') od?: string, @Query('do') do_?: string) {
    return this.warunki.podglad(userId, data(od), data(do_));
  }

  @Post('user/:userId/service')
  zaloz(@CurrentUser() u: Operator, @Param('userId') userId: string, @Body() dto: NowaUslugaDto) {
    return this.warunki.zalozUsluge(u.actorUserId ?? u.userId, userId, dto);
  }

  @Patch('subscription/:id')
  ustaw(@CurrentUser() u: Operator, @Param('id') id: string, @Body() dto: WarunkiDto) {
    return this.warunki.ustawWarunki(u.actorUserId ?? u.userId, id, dto);
  }

  @Patch('user/:userId/billing-outside')
  poza(@CurrentUser() u: Operator, @Param('userId') userId: string, @Body() dto: RozliczeniePozaDto) {
    return this.warunki.rozliczeniePoza(u.actorUserId ?? u.userId, userId, dto);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ResellerService } from './reseller.service.js';

class EnableResellerDto {
  @IsInt() @Min(0) @Max(300)
  markupPct!: number;

  @IsOptional() @IsString() @MaxLength(80)
  brandName?: string;
}

class UpdateResellerDto {
  @IsOptional() @IsInt() @Min(0) @Max(300)
  markupPct?: number;

  @IsOptional() @IsString() @MaxLength(80)
  brandName?: string;

  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'PENDING'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}

/** RSL — administracja resellerami (admin + staff z CUSTOMERS_MANAGE). */
@Controller('admin/reseller')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOMERS_MANAGE')
export class ResellerAdminController {
  constructor(private readonly reseller: ResellerService) {}

  @Get()
  list() {
    return this.reseller.adminList();
  }

  @Post(':userId/enable')
  @HttpCode(200)
  enable(@Param('userId') userId: string, @Body() dto: EnableResellerDto, @CurrentUser() actor: { userId: string }) {
    return this.reseller.adminEnable(userId, dto, actor.userId);
  }

  @Put(':userId')
  update(@Param('userId') userId: string, @Body() dto: UpdateResellerDto, @CurrentUser() actor: { userId: string }) {
    return this.reseller.adminUpdate(userId, dto, actor.userId);
  }
}

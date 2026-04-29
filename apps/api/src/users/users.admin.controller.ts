import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@ekohost/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersAdminService } from './users.admin.service';

class ImpersonateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ListUsersQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

interface AuthedUser {
  userId: string;
  email: string;
  role: Role;
  actorUserId?: string;
  impersonatedBy?: string;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class UsersAdminController {
  constructor(private readonly admin: UsersAdminService) {}

  @Get()
  async list(@Query() query: ListUsersQuery) {
    const limit = parseIntSafe(query.limit, 50);
    const page = Math.max(parseIntSafe(query.page, 1), 1);
    const offset = (page - 1) * limit;
    const result = await this.admin.list({
      search: query.search,
      role: query.role,
      limit,
      offset,
    });
    return {
      ...result,
      page,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
    };
  }

  @Post(':id/impersonate')
  async impersonate(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: ImpersonateDto,
    @Req() req: Request,
  ) {
    const ip = extractIp(req);
    const userAgent = req.headers['user-agent']?.toString() ?? null;
    return this.admin.impersonate({
      targetUserId: id,
      ctx: {
        actorUserId: user.userId,
        actorRole: user.role,
        alreadyImpersonating: user.impersonatedBy ?? null,
      },
      ipAddress: ip,
      userAgent,
      reason: dto.reason,
    });
  }

  @Post('impersonate/stop')
  async stop(@CurrentUser() user: AuthedUser, @Req() req: Request) {
    if (!user.impersonatedBy) {
      throw new BadRequestException('Not currently impersonating');
    }
    return this.admin.stopImpersonation({
      actorUserId: user.impersonatedBy,
      impersonatedUserId: user.userId,
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function extractIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0]!.trim();
  }
  return req.ip ?? null;
}

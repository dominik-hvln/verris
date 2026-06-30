import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersAdminService } from './users.admin.service';
import { UsersService } from './users.service';
import { HostingDiagnosticsService } from '../diagnostics/hosting-diagnostics.service';
import {
  DnsTlsDiagnosticDto,
  AdminCustomerOperationalDto,
  AdminChangeCustomerEmailDto,
  AdminResetCustomerPasswordDto,
  AdminSetGrafanaAccessDto,
} from './users.admin.dto';

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
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOMERS_VIEW')
export class UsersAdminController {
  constructor(
    private readonly admin: UsersAdminService,
    private readonly diagnostics: HostingDiagnosticsService,
    private readonly users: UsersService,
  ) {}

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

  /**
   * Sprint 4 / R-04 — agregat pod formularz operacyjny (tylko ADMIN, konto USER).
   */
  @Get(':id/operational-detail')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW')
  async operationalDetail(@Param('id') id: string) {
    return this.admin.getCustomerOperationalDetail(id);
  }

  /**
   * Sprint 3 / R-01 — agregowany widok klienta dla BOK (subskrypcje, tickety, domeny).
   */
  @Get(':id/customer-profile')
  async customerProfile(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.admin.getCustomer360(id, {
      actorUserId: user.userId,
      actorRole: user.role,
    });
  }

  /**
   * Sprint 3 / R-02 — diagnostyka DNS + TLS dla domeny konta klienta (audytowany zapis).
   */
  @Post(':id/diagnostics/dns-tls')
  @HttpCode(200)
  async runDnsTls(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: DnsTlsDiagnosticDto,
    @Req() req: Request,
  ) {
    return this.diagnostics.runDnsTlsForUser({
      targetUserId: id,
      actorUserId: user.userId,
      actorRole: user.role,
      subscriptionId: dto.subscriptionId,
      domain: dto.domain,
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }

  /**
   * Sprint 4 / R-04 — blokada logowania, powód, notatka wewnętrzna.
   */
  @Patch(':id/operational')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_MANAGE')
  async patchOperational(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: AdminCustomerOperationalDto,
    @Req() req: Request,
  ) {
    return this.admin.patchCustomerOperational(id, user.userId, dto, {
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }

  /**
   * Sprint 4 / R-04 — zmiana e-maila z walidacją + best-effort Stripe Customer.
   */
  @Post(':id/email')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  async changeEmail(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: AdminChangeCustomerEmailDto,
    @Req() req: Request,
  ) {
    return this.admin.changeCustomerEmail(
      id,
      user.userId,
      dto.newEmail,
      dto.reason,
      {
        ipAddress: extractIp(req),
        userAgent: req.headers['user-agent']?.toString() ?? null,
      },
    );
  }

  /**
   * Sprint 4 / R-04 — reset hasła (hasło jednorazowo w odpowiedzi); czyści 2FA.
   */
  @Post(':id/reset-password')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  async resetPassword(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: AdminResetCustomerPasswordDto,
    @Req() req: Request,
  ) {
    return this.admin.resetCustomerPassword(id, user.userId, dto, {
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }

  /**
   * Sprint 4 / A-10 — toggle Grafana access dla konta STAFF (audytowany).
   * Zastępuje ręczny `UPDATE "User" SET "canAccessGrafana"=true ...`.
   */
  @Post(':id/grafana-access')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  async setGrafanaAccess(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: AdminSetGrafanaAccessDto,
    @Req() req: Request,
  ) {
    return this.admin.setGrafanaAccess(id, user.userId, dto.enabled, dto.reason, {
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }

  /**
   * Sprint 6 — Historia logowań operatorów (STAFF/ADMIN). ADMIN-only,
   * pokazuje sukces (LoginEvent) + nieudane próby (LoginAttempt) w jednym
   * widoku, plus aktualny status lockoutu (rolling 15 min, 10 prób).
   */
  @Get(':id/login-history')
  @Roles(Role.ADMIN)
  async loginHistory(@Param('id') id: string) {
    return this.admin.getLoginHistory(id);
  }

  /**
   * Sprint 6 — Staff audit: ograniczony podgląd własnych akcji + akcji per
   * klient (bez wrażliwych payloadów). Działa dla STAFF i ADMIN — STAFF
   * dostaje filtr `actorUserId == self`, ADMIN dostaje pełen log per user.
   */
  @Get(':id/staff-audit')
  async staffAudit(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.getCustomerAuditTrail({
      targetUserId: id,
      actorUserId: user.userId,
      actorRole: user.role,
      limit: parseIntSafe(limit, 50),
    });
  }

  @Post(':id/impersonate')
  @Roles(Role.ADMIN)
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

  @Get('referral-enrollments')
  @StaffPerm('PROMO_MANAGE')
  listReferralEnrollments(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.users.listReferralEnrollments(status);
  }

  @Patch('referral-enrollments/:userId')
  @StaffPerm('PROMO_MANAGE')
  reviewReferralEnrollment(
    @Param('userId') userId: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string },
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.users.reviewReferralEnrollment(userId, body, actor.userId);
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

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm, StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { WniosekMozliwy } from '../wnioski/wniosek-mozliwy.decorator.js';
import { UsersAdminService } from './users.admin.service.js';
import { UsersService } from './users.service.js';
import { HostingDiagnosticsService } from '../diagnostics/hosting-diagnostics.service.js';
import {
  DnsTlsDiagnosticDto,
  AdminCustomerOperationalDto,
  AdminChangeCustomerEmailDto,
  AdminResetCustomerPasswordDto,
  AdminSetGrafanaAccessDto,
  AdminCreateCustomerDto,
  OcenaZgloszeniaPolecenDto,
  NowaNotatkaKlientaDto,
  PrzypiecieNotatkiDto,
} from './users.admin.dto.js';
import { NotatkiKlientaService } from './notatki-klienta.service.js';
import { CustomerIamService } from './customer-iam.service.js';

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

  /** F2.4 — stan konta (aktywne, zablokowane, zalegle, zawieszone, usuwane, zanonimizowane, wewnetrzne). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  saldoOd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  saldoDo?: string;

  /** Data założenia konta od–do (RRRR-MM-DD). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  od?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  do?: string;
}

interface AuthedUser {
  userId: string;
  email: string;
  role: Role;
  actorUserId?: string;
  impersonatedBy?: string;
  principalUserId?: string;
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
    private readonly notatki: NotatkiKlientaService,
    private readonly iam: CustomerIamService,
  ) {}

  @Get()
  async list(@Query() query: ListUsersQuery, @CurrentUser() user: AuthedUser) {
    const limit = parseIntSafe(query.limit, 50);
    const page = Math.max(parseIntSafe(query.page, 1), 1);
    const offset = (page - 1) * limit;
    const result = await this.admin.list({
      search: query.search,
      role: query.role,
      status: query.status,
      saldoOd: query.saldoOd,
      saldoDo: query.saldoDo,
      od: query.od,
      do: query.do,
      limit,
      offset,
      aktorRola: user.role,
    });
    return {
      ...result,
      page,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
    };
  }

  /**
   * F2.4 — eksport listy klientów do CSV (filtry jak lista; zawsze tylko konta klientów). Dane osobowe: osobne
   * uprawnienie EXPORT_DATA (L4) i wpis w dzienniku (OPERATOR_LIST_EXPORTED z filtrami i liczbą wierszy).
   */
  @Get('export.csv')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW', 'EXPORT_DATA')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() query: ListUsersQuery, @CurrentUser() user: AuthedUser, @Res() res: Response) {
    const csv = await this.admin.exportCustomersCsv(
      { search: query.search, status: query.status, saldoOd: query.saldoOd, saldoDo: query.saldoDo, od: query.od, do: query.do },
      user.principalUserId ?? user.userId,
    );
    res.setHeader('Content-Disposition', `attachment; filename="verris-klienci-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
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
  async customerProfile(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Query('sekcja') sekcja?: string) {
    return this.admin.getCustomer360(id, {
      actorUserId: user.userId,
      actorRole: user.role,
      // Zakładka karty do dziennika — tylko krótki identyfikator, nic innego z adresu nie trafia do wpisu.
      sekcja: typeof sekcja === 'string' && /^[a-z]{1,20}$/.test(sekcja) ? sekcja : undefined,
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

  /** F2.4 — członkowie zespołu klienta (subkonta, członkostwa, zaproszenia) — tylko odczyt, w dzienniku. */
  @Get(':id/zespol')
  zespol(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.iam.zespolDlaOperatora(id, user.principalUserId ?? user.userId);
  }

  /** F2.4 — notatki wewnętrzne o kliencie (przypięte pierwsze, potem od najnowszej). Odczyt: CUSTOMERS_VIEW. */
  @Get(':id/notes')
  notes(@Param('id') id: string) {
    return this.notatki.lista(id);
  }

  /**
   * F2.4 — dopisanie notatki: kto widzi klienta i prowadzi obsługę (TICKETS_MANAGE — L1) albo zarządza klientem
   * (CUSTOMERS_MANAGE). Audytor (sam podgląd) nie dopisuje. Autor = operator, nie edytowalne.
   */
  @Post(':id/notes')
  @StaffPerm('CUSTOMERS_VIEW')
  @StaffPermAny('TICKETS_MANAGE', 'CUSTOMERS_MANAGE')
  addNote(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: NowaNotatkaKlientaDto) {
    return this.notatki.dodaj(id, user.principalUserId ?? user.userId, dto);
  }

  @Patch(':id/notes/:noteId')
  @StaffPerm('CUSTOMERS_VIEW')
  @StaffPermAny('TICKETS_MANAGE', 'CUSTOMERS_MANAGE')
  pinNote(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Param('noteId') noteId: string, @Body() dto: PrzypiecieNotatkiDto) {
    return this.notatki.przypnij(id, noteId, user.principalUserId ?? user.userId, dto.przypieta);
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
    return this.admin.patchCustomerOperational(
      id,
      user.userId,
      dto,
      { ipAddress: extractIp(req), userAgent: req.headers['user-agent']?.toString() ?? null },
      { role: user.role, userId: user.principalUserId ?? user.userId },
    );
  }

  /**
   * Sprint 4 / R-04 — zmiana e-maila z walidacją + best-effort Stripe Customer.
   * D9 (10.10): bezpośrednio ADMIN i STAFF z CUSTOMERS_MANAGE (L3); niżej — 403 WYMAGA_WNIOSKU i wniosek
   * CUSTOMER_EMAIL_CHANGE (rejestr-wnioskow.ts). Powód obowiązkowy (D2).
   */
  @Post(':id/email')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_MANAGE')
  @WniosekMozliwy('CUSTOMER_EMAIL_CHANGE')
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

  /** A-24 — operator zakłada konto klienta; klient ustawia hasło z linku w mailu. */
  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_MANAGE')
  async createCustomer(
    @CurrentUser() user: AuthedUser,
    @Body() dto: AdminCreateCustomerDto,
    @Req() req: Request,
  ) {
    return this.admin.createCustomerByOperator(user.actorUserId ?? user.userId, dto, {
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent']?.toString() ?? null,
    });
  }

  /**
   * Reset hasła klienta — D9/D3 (10.10): operator nie widzi hasła; klient dostaje link do ustawienia nowego
   * (czyści 2FA jak dotąd). Bezpośrednio ADMIN i STAFF z CUSTOMERS_MANAGE (L3); niżej — wniosek
   * CUSTOMER_PASSWORD_RESET. Powód obowiązkowy (D2).
   */
  @Post(':id/reset-password')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_MANAGE')
  @WniosekMozliwy('CUSTOMER_PASSWORD_RESET')
  async resetPassword(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: AdminResetCustomerPasswordDto,
    @Req() req: Request,
  ) {
    return this.admin.resetCustomerPassword(
      id,
      user.userId,
      dto,
      { ipAddress: extractIp(req), userAgent: req.headers['user-agent']?.toString() ?? null },
      { role: user.role },
    );
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
   * Sprint 6 — historia logowań: sukces (LoginEvent) + nieudane próby (LoginAttempt) w jednym widoku, plus
   * aktualny status lockoutu (rolling 15 min, 10 prób). ADMIN — każde konto (także karta operatora);
   * D9 (10.10): STAFF z CUSTOMERS_VIEW — tylko konta klientów, każdy odczyt w dzienniku.
   */
  @Get(':id/login-history')
  @Roles(Role.ADMIN, Role.STAFF)
  async loginHistory(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.admin.getLoginHistory(id, { actorUserId: user.userId, actorRole: user.role });
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

  /**
   * PB-41 (decyzja właściciela 08.10): staff wchodzi na konto klienta z osobnym uprawnieniem — powód, 30 min i wpis
   * w dzienniku jak u admina. Wcześniej @Roles(ADMIN) przy serwisie dopuszczającym STAFF: przycisk w panelu staff
   * kończył się 403. Staff tylko na konta USER (pilnuje serwis).
   */
  @Post(':id/impersonate')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW', 'CUSTOMERS_IMPERSONATE')
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
    @Body() body: OcenaZgloszeniaPolecenDto,
    @CurrentUser() actor: AuthedUser,
  ) {
    return this.users.reviewReferralEnrollment(userId, body, actor.userId);
  }

  /**
   * Zakończenie wołane z panelu klienta tokenem impersonacji (rola klienta: USER). Role i uprawnienia klasy
   * (ADMIN/STAFF + CUSTOMERS_VIEW) odrzucały je 403, panel klienta ignorował błąd — w dzienniku był tylko
   * USER_IMPERSONATION_STARTED, bez zakończenia (o05, 07–08.10). Warunek: token z impersonatedBy (niżej).
   */
  @Post('impersonate/stop')
  @Roles(Role.ADMIN, Role.STAFF, Role.USER)
  @StaffPerm()
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
  // F-10: req.ip (trust proxy w main.ts) jest wiarygodny; lewy wpis X-Forwarded-For podaje klient.
  if (req.ip) return req.ip;
  const fwd = req.headers['x-forwarded-for'];
  return typeof fwd === 'string' && fwd.length > 0 ? fwd.split(',')[0]!.trim() : null;
}

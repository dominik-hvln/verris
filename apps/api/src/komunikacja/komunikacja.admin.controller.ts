import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { MAIL_OBSLUGI_TEMAT_MAX, MAIL_OBSLUGI_TRESC_MAX, SZABLONY_MAILI_OBSLUGI, type ZakresKomunikatu } from '@verris/contracts';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm, StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { MailDoKlientaService } from './mail-do-klienta.service.js';
import { KomunikatySerwisoweService } from './komunikaty-serwisowe.service.js';
import { StatusObslugiService } from './status-obslugi.service.js';

export class MailDoKlientaDto {
  @IsIn(SZABLONY_MAILI_OBSLUGI.map((s) => s.id)) szablon!: string;
  @IsString() @MaxLength(MAIL_OBSLUGI_TEMAT_MAX) temat!: string;
  @IsString() @MaxLength(MAIL_OBSLUGI_TRESC_MAX) tresc!: string;
  @IsOptional() @IsString() @MaxLength(64) zgloszenie?: string;
}

export class PodgladKomunikatuDto {
  @IsIn(['WEZEL', 'PLAN']) zakres!: ZakresKomunikatu;
  @IsUUID('all') celId!: string;
  @IsString() @MaxLength(MAIL_OBSLUGI_TEMAT_MAX) temat!: string;
  @IsString() @MaxLength(MAIL_OBSLUGI_TRESC_MAX) tresc!: string;
}

export class ZlecKomunikatDto extends PodgladKomunikatuDto {
  @IsString() @MaxLength(500) powod!: string;
}

/**
 * F3.8 (ON-03) — mail do klienta z szablonu z karty klienta: osoby, które rozmawiają z klientami
 * (CUSTOMERS_VIEW + TICKETS_MANAGE: L1 i wyżej, Finanse, Sprzedaż, IOD, abuse). Usługi zespołu — nie (tylko USER).
 */
@Controller('admin/users/:id/mail-obslugi')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOMERS_VIEW', 'TICKETS_MANAGE')
export class MailDoKlientaAdminController {
  constructor(private readonly mail: MailDoKlientaService) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:mail-do-klienta' })
  wyslij(@Param('id') id: string, @Body() b: MailDoKlientaDto, @CurrentUser() op: { userId: string }) {
    return this.mail.wyslij(id, op.userId, b);
  }
}

/** F3.8 (ON-01) — komunikat serwisowy do klientów węzła albo planu: L4 (SERVICE_NOTICES_SEND) i ADMIN. */
@Controller('admin/komunikaty-serwisowe')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('SERVICE_NOTICES_SEND')
export class KomunikatySerwisoweAdminController {
  constructor(private readonly komunikaty: KomunikatySerwisoweService) {}

  @Get()
  lista() {
    return this.komunikaty.lista();
  }

  @Get(':id')
  widok(@Param('id') id: string) {
    return this.komunikaty.widok(id);
  }

  @Post('podglad')
  @HttpCode(200)
  podglad(@Body() b: PodgladKomunikatuDto) {
    return this.komunikaty.podglad(b);
  }

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'admin:komunikat-serwisowy' })
  zlec(@Body() b: ZlecKomunikatDto, @CurrentUser() op: { userId: string }) {
    return this.komunikaty.zlec(b, op.userId);
  }

  @Post(':id/zatrzymaj')
  @HttpCode(200)
  zatrzymaj(@Param('id') id: string, @CurrentUser() op: { userId: string }) {
    return this.komunikaty.zatrzymaj(id, op.userId);
  }
}

/** F3.8 (ON-05) — baner incydentów i prac serwisowych w panelu operatora: każdy operator z rolą systemową. */
@Controller('admin/status-obslugi')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class StatusObslugiAdminController {
  constructor(private readonly status: StatusObslugiService) {}

  @Get()
  @StaffPermAny('DASHBOARD_VIEW', 'TICKETS_VIEW', 'NODES_VIEW', 'CUSTOMERS_VIEW')
  biezace() {
    return this.status.biezace();
  }
}

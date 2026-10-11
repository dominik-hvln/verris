import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, Max, Min } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { WniosekMozliwy } from '../wnioski/wniosek-mozliwy.decorator.js';
import { PowodOperatoraDto } from './dto/akcje-konta.dto.js';
import { CyklZyciaUslugiService, OBIETNICA_MAKS_DNI, type ZlecenieCyklu } from './cykl-zycia-uslugi.service.js';

export class DataOdnowieniaDto extends PowodOperatoraDto {
  /** Nowy koniec bieżącego okresu (ISO 8601). */
  @IsISO8601({ strict: true }) nowaData!: string;
}

export class ObietnicaZaplatyDto extends PowodOperatoraDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(OBIETNICA_MAKS_DNI) dni!: number;
}

type Aktor = { userId: string; role: string };
const zlecenie = (id: string, actor: Aktor, b: PowodOperatoraDto): ZlecenieCyklu => ({
  subscriptionId: id,
  operator: { userId: actor.userId, role: actor.role },
  powod: b.powod,
  zgloszenie: b.zgloszenie,
});

/**
 * F3.5 — cykl życia usługi z karty usługi (sekcja „Operacje”). Logika, dziennik i reguły: cykl-zycia-uslugi.service.ts.
 *  - anulacja na koniec okresu i jej cofnięcie — odwracalne (D2): SUBSCRIPTIONS_MANAGE (L2, NOC) z powodem;
 *  - data odnowienia (przedłużenie gratis) — koszt (D2): BILLING_MANAGE + SUBSCRIPTIONS_MANAGE (L4); niżej wniosek
 *    SUBSCRIPTION_RENEWAL_DATE, który akceptuje L4 albo administrator;
 *  - obietnica zapłaty (wstrzymanie zawieszenia za brak płatności, maks. 7 dni) — SUBSCRIPTIONS_MANAGE +
 *    SUBSCRIPTIONS_SUSPEND (L3). Samo SUSPEND ma też zespół abuse, który „nie rusza rozliczeń” — obietnica to decyzja
 *    o należności, nie o nadużyciu (przegląd F3.5).
 */
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('SUBSCRIPTIONS_MANAGE')
@RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:cykl-zycia-uslugi' })
export class CyklZyciaUslugiAdminController {
  constructor(private readonly cykl: CyklZyciaUslugiService) {}

  @Post(':id/anulacja')
  @HttpCode(200)
  anuluj(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.cykl.anulujNaKoniecOkresu(zlecenie(id, actor, b));
  }

  @Post(':id/anulacja/cofnij')
  @HttpCode(200)
  cofnijAnulacje(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.cykl.cofnijAnulacje(zlecenie(id, actor, b));
  }

  @Post(':id/data-odnowienia')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE', 'SUBSCRIPTIONS_MANAGE')
  @WniosekMozliwy('SUBSCRIPTION_RENEWAL_DATE')
  zmienDateOdnowienia(@Param('id') id: string, @Body() b: DataOdnowieniaDto, @CurrentUser() actor: Aktor) {
    return this.cykl.zmienDateOdnowienia({ ...zlecenie(id, actor, b), nowaData: new Date(b.nowaData) });
  }

  @Post(':id/obietnica-zaplaty')
  @HttpCode(200)
  @StaffPerm('SUBSCRIPTIONS_MANAGE', 'SUBSCRIPTIONS_SUSPEND')
  ustawObietnice(@Param('id') id: string, @Body() b: ObietnicaZaplatyDto, @CurrentUser() actor: Aktor) {
    return this.cykl.ustawObietniceZaplaty({ ...zlecenie(id, actor, b), dni: b.dni });
  }

  @Post(':id/obietnica-zaplaty/odwolaj')
  @HttpCode(200)
  @StaffPerm('SUBSCRIPTIONS_MANAGE', 'SUBSCRIPTIONS_SUSPEND')
  odwolajObietnice(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.cykl.odwolajObietniceZaplaty(zlecenie(id, actor, b));
  }
}

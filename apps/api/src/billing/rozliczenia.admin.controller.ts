import { BadRequestException, Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, MaxLength } from 'class-validator';
import { Role, WalletTxType } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PowodOperatoraDto } from '../subscriptions/dto/akcje-konta.dto.js';
import { MAKS_KWOTA, RozliczeniaOperatoraService, ZRODLA_PLATNOSCI, type ZrodloPlatnosci } from './rozliczenia-operatora.service.js';

export class KorektaSaldaDto extends PowodOperatoraDto {
  @IsIn(['plus', 'minus']) kierunek!: 'plus' | 'minus';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(MAKS_KWOTA) kwota!: number;
  /** Klucz operacji z formularza (UUID) — ponowione wysłanie tego samego formularza nie księguje drugi raz. */
  @IsString() @Matches(/^[A-Za-z0-9-]{8,64}$/) klucz!: string;
}

export class WplataPrzelewemDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(MAKS_KWOTA) kwota!: number;
  @IsString() @Length(3, 140) tytul!: string;
  /** Identyfikator transakcji z wyciągu — klucz idempotencji (ten sam przelew nie wejdzie dwa razy). */
  @IsString() @Length(4, 100) referencja!: string;
  @IsISO8601({ strict: true }) dataWplaty!: string;
  @IsOptional() @IsString() @MaxLength(64) zgloszenie?: string;
}

type Aktor = { userId: string; role: string };
const operator = (a: Aktor) => ({ userId: a.userId, role: a.role });

/**
 * F3.6 — rozliczenia w panelu operatora. Logika, dziennik i reguły: rozliczenia-operatora.service.ts.
 *  - odczyt (nieudane płatności, ruchy portfela klienta, przypomnienia i zawieszenia) — BILLING_VIEW (od L1, Finanse,
 *    Audytor); bez eksportu (eksport list to EXPORT_DATA — billing.admin.controller.ts);
 *  - pieniądze (wpłata przelewem, korekta salda ±, ponowienie auto-doładowania) — BILLING_MANAGE (L4, Finanse)
 *    z powodem (D2); korekta i wpłata idempotentne po kluczu księgi.
 */
@Controller('admin/rozliczenia')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('BILLING_VIEW')
export class RozliczeniaAdminController {
  constructor(private readonly rozliczenia: RozliczeniaOperatoraService) {}

  @Get('nieudane-platnosci')
  nieudanePlatnosci(
    @Query('zrodlo') zrodlo: string | undefined,
    @Query('dni', new DefaultValuePipe(30), ParseIntPipe) dni: number,
    @Query('userId') userId: string | undefined,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @CurrentUser() a: Aktor,
  ) {
    if (zrodlo && !ZRODLA_PLATNOSCI.includes(zrodlo as ZrodloPlatnosci)) throw new BadRequestException('Nieznane źródło płatności.');
    if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) throw new BadRequestException('Niepoprawny identyfikator klienta.');
    return this.rozliczenia.nieudanePlatnosci({ zrodlo: (zrodlo as ZrodloPlatnosci) || undefined, dni, userId: userId || undefined, limit, offset }, operator(a));
  }

  @Post('nieudane-platnosci/auto-doladowanie/:userId/ponow')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:rozliczenia-ponow' })
  ponowAutoDoladowanie(@Param('userId', ParseUUIDPipe) userId: string, @Body() b: PowodOperatoraDto, @CurrentUser() a: Aktor) {
    return this.rozliczenia.ponowAutoDoladowanie({ userId, operator: operator(a), powod: b.powod, zgloszenie: b.zgloszenie });
  }

  @Get('windykacja')
  windykacja() {
    return this.rozliczenia.windykacjaLista();
  }

  @Get('klienci/:userId/windykacja')
  windykacjaKlienta(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() a: Aktor) {
    return this.rozliczenia.windykacjaKlienta(userId, operator(a));
  }

  @Get('klienci/:userId/portfel')
  ruchyPortfela(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() a: Aktor,
    @Query('typ') typ: string | undefined,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    if (typ && !Object.values<string>(WalletTxType).includes(typ)) throw new BadRequestException('Nieznany typ operacji portfela.');
    return this.rozliczenia.ruchyPortfela(userId, operator(a), { typ: (typ as WalletTxType) || undefined, limit, offset });
  }

  @Post('klienci/:userId/portfel/korekta')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:rozliczenia-korekta' })
  korektaSalda(@Param('userId', ParseUUIDPipe) userId: string, @Body() b: KorektaSaldaDto, @CurrentUser() a: Aktor) {
    return this.rozliczenia.korektaSalda({ userId, operator: operator(a), kierunek: b.kierunek, kwota: b.kwota, powod: b.powod, zgloszenie: b.zgloszenie, klucz: b.klucz });
  }

  @Post('klienci/:userId/wplaty')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE')
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'admin:rozliczenia-wplaty' })
  zaksiegujPrzelew(@Param('userId', ParseUUIDPipe) userId: string, @Body() b: WplataPrzelewemDto, @CurrentUser() a: Aktor) {
    return this.rozliczenia.zaksiegujPrzelew({
      userId,
      operator: operator(a),
      kwota: b.kwota,
      tytul: b.tytul,
      referencja: b.referencja,
      dataWplaty: new Date(b.dataWplaty),
      zgloszenie: b.zgloszenie,
    });
  }
}

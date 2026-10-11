import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../../common/guards/staff-permissions.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { StaffPerm } from '../../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PocztaPrzychodzacaService, type AktorPoczty } from './poczta-przychodzaca.service.js';

class ListaPocztyQuery {
  @IsOptional() @IsString() widok?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

class PrzypiszPocztaDto {
  @IsOptional() @IsUUID() userId?: string;
  /** Adres konta klienta — zamiast userId (panel nie musi szukać klienta osobno). */
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  /** Pełne id zgłoszenia albo pierwsze 8 znaków (#xxxxxxxx). */
  @IsOptional() @Matches(/^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i) zgloszenieId?: string;
}

class OdrzucPocztaDto {
  @IsString() @MinLength(3) @MaxLength(300) powod!: string;
  @IsOptional() @IsBoolean() zablokuj?: boolean;
}

class BlokadaNadawcyDto {
  @IsString() @MaxLength(320) wzorzec!: string;
  @IsOptional() @IsString() @MaxLength(300) powod?: string;
}

/**
 * F3.7 (OE-19, OE-20) — „Poczta bez klienta”: maile do zgłoszeń, których nie dało się przypisać (obcy nadawca, nie
 * właściciel zgłoszenia z wątku, DMARC) i spam. Odczyt — TICKETS_VIEW; decyzje (przypisanie, odrzucenie, blokady
 * nadawców — odwracalne, D2) — TICKETS_MANAGE (L1+). Ścieżka poza `tickets/admin/:id`, żeby nie wpadła w tamtą trasę.
 * Audyt Fali 3 — maile do abuse@ (lista, „Pokaż”, przypisanie, odrzucenie) i blokada całej domeny: dodatkowo
 * ABUSE_MANAGE albo ADMIN, sprawdzane w serwisie per wpis (granica jak kolejka staff/abuse).
 */
@Controller('admin/poczta-zgloszen')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.STAFF, Role.ADMIN)
export class PocztaPrzychodzacaAdminController {
  constructor(private readonly poczta: PocztaPrzychodzacaService) {}

  @Get()
  @StaffPerm('TICKETS_VIEW')
  lista(@Query() q: ListaPocztyQuery, @CurrentUser() user: AktorPoczty) {
    return this.poczta.lista(q, user);
  }

  @Get('blokady')
  @StaffPerm('TICKETS_VIEW')
  blokady() {
    return this.poczta.blokady();
  }

  @Post('blokady')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  zablokuj(@Body() dto: BlokadaNadawcyDto, @CurrentUser() user: AktorPoczty) {
    return this.poczta.zablokuj(dto.wzorzec, dto.powod, user);
  }

  @Post('blokady/usun')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  odblokuj(@Body() dto: BlokadaNadawcyDto, @CurrentUser() user: { userId: string }) {
    return this.poczta.odblokuj(dto.wzorzec, user.userId);
  }

  /** „Pokaż” — plik od nieznanego nadawcy tylko z `potwierdzam=1`, zawsze jako pobranie. */
  @Get(':id/pliki/:nr')
  @StaffPerm('TICKETS_VIEW')
  async plik(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nr', ParseIntPipe) nr: number,
    @Query('potwierdzam') potwierdzam: string | undefined,
    @CurrentUser() user: AktorPoczty,
  ) {
    const p = await this.poczta.plik(id, nr, potwierdzam === '1', user);
    return new StreamableFile(p.stream, {
      type: p.typ,
      disposition: `attachment; filename="${encodeURIComponent(p.nazwa)}"`,
    });
  }

  @Post(':id/przypisz')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  przypisz(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrzypiszPocztaDto, @CurrentUser() user: AktorPoczty) {
    return this.poczta.przypisz(id, user, dto);
  }

  @Post(':id/odrzuc')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  odrzuc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OdrzucPocztaDto, @CurrentUser() user: AktorPoczty) {
    return this.poczta.odrzuc(id, user, dto);
  }
}

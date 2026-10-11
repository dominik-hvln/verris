import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../../common/guards/staff-permissions.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { StaffPerm } from '../../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PocztaPrzychodzacaService } from './poczta-przychodzaca.service.js';

class ListaPocztyQuery {
  @IsOptional() @IsString() widok?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

class PrzypiszPocztaDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() zgloszenieId?: string;
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
 */
@Controller('admin/poczta-zgloszen')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.STAFF, Role.ADMIN)
export class PocztaPrzychodzacaAdminController {
  constructor(private readonly poczta: PocztaPrzychodzacaService) {}

  @Get()
  @StaffPerm('TICKETS_VIEW')
  lista(@Query() q: ListaPocztyQuery) {
    return this.poczta.lista(q);
  }

  @Get('blokady')
  @StaffPerm('TICKETS_VIEW')
  blokady() {
    return this.poczta.blokady();
  }

  @Post('blokady')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  zablokuj(@Body() dto: BlokadaNadawcyDto, @CurrentUser() user: { userId: string }) {
    return this.poczta.zablokuj(dto.wzorzec, dto.powod, user.userId);
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
    @CurrentUser() user: { userId: string },
  ) {
    const p = await this.poczta.plik(id, nr, potwierdzam === '1', user.userId);
    return new StreamableFile(p.stream, {
      type: p.typ,
      disposition: `attachment; filename="${encodeURIComponent(p.nazwa)}"`,
    });
  }

  @Post(':id/przypisz')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  przypisz(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PrzypiszPocztaDto, @CurrentUser() user: { userId: string }) {
    return this.poczta.przypisz(id, user.userId, dto);
  }

  @Post(':id/odrzuc')
  @HttpCode(200)
  @StaffPerm('TICKETS_MANAGE')
  odrzuc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OdrzucPocztaDto, @CurrentUser() user: { userId: string }) {
    return this.poczta.odrzuc(id, user.userId, dto);
  }
}

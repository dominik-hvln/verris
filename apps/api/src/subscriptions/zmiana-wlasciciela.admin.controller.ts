import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { ZmianaWlascicielaService } from './zmiana-wlasciciela.service.js';

export class PodgladZmianyWlascicielaQuery {
  @IsEmail() @MaxLength(254) email!: string;
}

export class ZmianaWlascicielaDto {
  /** Adres e-mail istniejącego konta klienta — nowego właściciela. */
  @IsEmail() @MaxLength(254) email!: string;
  /** Powód do dziennika (min. 10 znaków — sprawdza serwis, ten sam komunikat co w podglądzie). */
  @IsString() @MaxLength(500) powod!: string;
  /** Adres nowego właściciela wpisany ponownie (potwierdzenie operacji). */
  @IsString() @MaxLength(254) potwierdzenie!: string;
}

/**
 * K2 (PB-53.5) — „Zmień właściciela” na karcie usługi. Tylko ADMIN, bez nadpisania ról i bez wniosku (operacja
 * wrażliwa jak zmiana e-maila klienta: usługa z danymi trafia do innego klienta). Reguły: zmiana-wlasciciela.service.ts.
 */
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:zmiana-wlasciciela' })
export class ZmianaWlascicielaAdminController {
  constructor(private readonly zmiana: ZmianaWlascicielaService) {}

  @Get(':id/zmiana-wlasciciela')
  podglad(@Param('id', ParseUUIDPipe) id: string, @Query() q: PodgladZmianyWlascicielaQuery) {
    return this.zmiana.podglad(id, q.email);
  }

  @Post(':id/zmiana-wlasciciela')
  @HttpCode(200)
  przenies(@Param('id', ParseUUIDPipe) id: string, @Body() b: ZmianaWlascicielaDto, @CurrentUser() actor: { userId: string; role: string }) {
    return this.zmiana.przenies({
      subscriptionId: id,
      operator: { userId: actor.userId, role: actor.role },
      email: b.email,
      powod: b.powod,
      potwierdzenie: b.potwierdzenie,
    });
  }
}

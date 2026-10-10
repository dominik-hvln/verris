import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { TablicaMigracjiService, type Aktor } from './tablica-migracji.service.js';
import { ChecklistaMigracjiDto, EtapMigracjiDto, KontaktMigracjiDto, UstawieniaMigracjiDto } from './dto/tablica-migracji.dto.js';

type Uzytkownik = { userId: string; principalUserId?: string; role: string };
const aktor = (u: Uzytkownik): Aktor => ({ userId: u.principalUserId ?? u.userId, role: u.role });

/**
 * D11 (10.10) — tablica migracji w panelu operatora: etapy Nowa → Testy u nas → Do zmiany DNS → Po przełączeniu →
 * Zamknięta, twarde terminy z alertem, Przerywacz, przypisanie, checklisty jako warunek przejścia, raport
 * pomigracyjny do klienta jednym kliknięciem i log kontaktów. MIGRATIONS_MANAGE (L2 — support migracji, L3, L4, NOC).
 */
@Controller('admin/migrations')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('MIGRATIONS_MANAGE')
export class TablicaMigracjiController {
  constructor(private readonly tablica: TablicaMigracjiService) {}

  @Get('tablica')
  lista(@CurrentUser() u: Uzytkownik, @Query('moje') moje?: string) {
    return this.tablica.tablica({ tylkoMoje: moje === '1', aktor: aktor(u) });
  }

  @Get(':id/obsluga')
  obsluga(@Param('id') id: string) {
    return this.tablica.obsluga(id);
  }

  @Post(':id/etap')
  @HttpCode(200)
  etap(@Param('id') id: string, @Body() dto: EtapMigracjiDto, @CurrentUser() u: Uzytkownik) {
    return this.tablica.zmienEtap(id, dto, aktor(u));
  }

  @Post(':id/ustawienia')
  @HttpCode(200)
  ustawienia(@Param('id') id: string, @Body() dto: UstawieniaMigracjiDto, @CurrentUser() u: Uzytkownik) {
    return this.tablica.ustaw(id, dto, aktor(u));
  }

  @Post(':id/checklista')
  @HttpCode(200)
  checklista(@Param('id') id: string, @Body() dto: ChecklistaMigracjiDto, @CurrentUser() u: Uzytkownik) {
    return this.tablica.checklista(id, dto, aktor(u));
  }

  @Post(':id/kontakty')
  @HttpCode(200)
  kontakt(@Param('id') id: string, @Body() dto: KontaktMigracjiDto, @CurrentUser() u: Uzytkownik) {
    return this.tablica.kontakt(id, dto, aktor(u));
  }

  @Get(':id/raport')
  podgladRaportu(@Param('id') id: string) {
    return this.tablica.podgladRaportu(id);
  }

  /** Mail do klienta — limit na operatora, żeby pomyłka w pętli nie zasypała klienta. */
  @Post(':id/raport')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'migracja:raport' })
  wyslijRaport(@Param('id') id: string, @CurrentUser() u: Uzytkownik) {
    return this.tablica.wyslijRaport(id, aktor(u));
  }

  /** Odczyt DNS domeny (bez operacji na węźle) — potwierdza przełączenie przed „Po przełączeniu”. */
  @Post(':id/sprawdz-dns')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'migracja:dns' })
  sprawdzDns(@Param('id') id: string, @CurrentUser() u: Uzytkownik) {
    return this.tablica.sprawdzDns(id, aktor(u));
  }
}

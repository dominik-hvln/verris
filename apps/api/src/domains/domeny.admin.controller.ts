import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { DomenyOperatoraService, type ZlecenieDomeny } from './domeny-operatora.service.js';
import {
  BlokadaDomenyDto,
  OdnowienieOperatoraDto,
  PonowienieZamowieniaDto,
  PowodDomenyDto,
  SerweryNazwOperatoraDto,
} from './dto/domeny-operatora.dto.js';

type Aktor = { userId: string; principalUserId?: string; role: string };
const kto = (a: Aktor) => a.principalUserId ?? a.userId;
const zlecenie = (actor: Aktor, b: PowodDomenyDto): ZlecenieDomeny => ({
  operatorUserId: kto(actor),
  operatorRole: actor.role,
  powod: b.powod,
  zgloszenie: b.zgloszenie,
});
const liczba = (v?: string) => (v && /^\d+$/.test(v) ? Number.parseInt(v, 10) : undefined);

/**
 * F2.7 (OI-01…06, OI-09; D2, D8) — domeny platformy w panelu operatora. Odczyt (lista, karta, abonent, zamówienia)
 * — CUSTOMERS_VIEW (L1 i wyżej); operacje u rejestratora — DOMAINS_MANAGE (L3); odnowienie na koszt Verris —
 * DOMAINS_MANAGE + BILLING_MANAGE (L4) albo ADMIN. Powód obowiązkowy, numer zgłoszenia opcjonalny.
 */
@Controller('admin/domains')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('CUSTOMERS_VIEW')
export class DomenyAdminController {
  constructor(private readonly domeny: DomenyOperatoraService) {}

  @Get()
  lista(@Query('stan') stan?: string, @Query('rejestr') rejestr?: string, @Query('wygasa') wygasa?: string, @Query('q') q?: string, @Query('page') page?: string) {
    return this.domeny.lista({ stan, rejestr, wygasa: liczba(wygasa), q, page: liczba(page) });
  }

  @Get('zamowienia')
  zamowienia() {
    return this.domeny.zamowienia();
  }

  @Post('zamowienia/sprawdz-transfery')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  sprawdzTransfery() {
    return this.domeny.sprawdzTransfery();
  }

  @Post('zamowienia/:orderId/ponow')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-zapis' })
  ponow(@Param('orderId') orderId: string, @Body() b: PonowienieZamowieniaDto, @CurrentUser() actor: Aktor) {
    return this.domeny.ponow(orderId, zlecenie(actor, b), b.authCode);
  }

  @Get(':id')
  karta(@Param('id') id: string) {
    return this.domeny.karta(id);
  }

  /** Dane abonenta u rejestratora — tylko odczyt; każdy odczyt w dzienniku zespołu. */
  @Get(':id/abonent')
  abonent(@Param('id') id: string, @CurrentUser() actor: Aktor) {
    return this.domeny.abonent(id, kto(actor));
  }

  @Get(':id/odnowienie-wycena')
  @StaffPerm('DOMAINS_MANAGE')
  wycena(@Param('id') id: string, @Query('lata') lata?: string) {
    const n = liczba(lata) ?? 1;
    return this.domeny.wycenaOdnowienia(id, Math.min(Math.max(n, 1), 10));
  }

  @Post(':id/synchronizuj')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  synchronizuj(@Param('id') id: string, @CurrentUser() actor: Aktor) {
    return this.domeny.synchronizuj(id, kto(actor));
  }

  @Post(':id/blokada')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-zapis' })
  blokada(@Param('id') id: string, @Body() b: BlokadaDomenyDto, @CurrentUser() actor: Aktor) {
    return this.domeny.blokada(id, zlecenie(actor, b), b.locked);
  }

  /** Kod EPP — od L3, z powodem; w dzienniku tylko fakt pokazania. */
  @Post(':id/kod-epp')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-epp' })
  kodEpp(@Param('id') id: string, @Body() b: PowodDomenyDto, @CurrentUser() actor: Aktor) {
    return this.domeny.kodEpp(id, zlecenie(actor, b));
  }

  @Put(':id/ns')
  @StaffPerm('DOMAINS_MANAGE')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-zapis' })
  serweryNazw(@Param('id') id: string, @Body() b: SerweryNazwOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.domeny.serweryNazw(id, zlecenie(actor, b), b.nameservers);
  }

  /** D8 — odnowienie z portfela klienta (L3). */
  @Post(':id/odnow')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-zapis' })
  odnow(@Param('id') id: string, @Body() b: OdnowienieOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.domeny.odnow(id, zlecenie(actor, b), b.years ?? 1, false);
  }

  /** D8 — odnowienie na koszt Verris: tylko L4 (DOMAINS_MANAGE + BILLING_MANAGE) albo ADMIN, z powodem. */
  @Post(':id/odnow-na-koszt-verris')
  @HttpCode(200)
  @StaffPerm('DOMAINS_MANAGE', 'BILLING_MANAGE')
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'admin:domeny-koszt-verris' })
  odnowNaKosztVerris(@Param('id') id: string, @Body() b: OdnowienieOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.domeny.odnow(id, zlecenie(actor, b), b.years ?? 1, true);
  }
}

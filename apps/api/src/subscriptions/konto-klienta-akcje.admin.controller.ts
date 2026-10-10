import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { AkcjeKontaOperatoraService, type ZlecenieOperatora } from './akcje-konta-operatora.service.js';
import {
  DodajRekordDnsOperatoraDto,
  PhpOperatoraDto,
  PowodOperatoraDto,
  ResetHaslaBazyDto,
  ResetHaslaFtpDto,
  ResetHaslaSkrzynkiDto,
  SslOperatoraDto,
  UsunRekordDnsOperatoraDto,
  ZmienRekordDnsOperatoraDto,
} from './dto/akcje-konta.dto.js';
import { MALWARE_MAX_POZYCJI, MALWARE_WZORCE } from './dto/malware.dto.js';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches } from 'class-validator';

/** F3.2 (G-12) — kwarantanna przez obsługę: te same wzorce ścieżek co panel klienta (malware.dto.ts) i skrypt węzła. */
export class KwarantannaOperatoraDto extends PowodOperatoraDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MALWARE_MAX_POZYCJI, { message: `Najwyżej ${MALWARE_MAX_POZYCJI} plików naraz.` })
  @IsString({ each: true }) @Matches(MALWARE_WZORCE.sciezka, { each: true, message: 'Tego pliku nie można przenieść do kwarantanny.' })
  sciezki!: string[];
}

export class PrzywrocZKwarantannyOperatoraDto extends PowodOperatoraDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MALWARE_MAX_POZYCJI, { message: `Najwyżej ${MALWARE_MAX_POZYCJI} plików naraz.` })
  @IsString({ each: true }) @Matches(MALWARE_WZORCE.wpis, { each: true, message: 'Nieprawidłowy wpis kwarantanny.' })
  wpisy!: string[];
}

type Aktor = { userId: string; role: string };
const zlecenie = (id: string, actor: Aktor, b: PowodOperatoraDto): ZlecenieOperatora => ({
  subscriptionId: id,
  operatorUserId: actor.userId,
  operatorRole: actor.role,
  powod: b.powod,
  zgloszenie: b.zgloszenie,
});

/**
 * F2.2 (D1/D2, 10.10) — pasek akcji konta na karcie usługi w panelu operatora. Akcje odwracalne (hasła, SSL, PHP,
 * kopia, skan) — ACCOUNT_ACTIONS (L2, zespół abuse); rekordy DNS — DNS_MANAGE (L3). Powód obowiązkowy, numer
 * zgłoszenia opcjonalny, operator nigdy nie widzi haseł. Logika i dziennik: akcje-konta-operatora.service.ts.
 */
@Controller('admin/subscriptions/:id/konto/akcje')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('ACCOUNT_ACTIONS')
@RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:konto-akcje' })
export class KontoKlientaAkcjeAdminController {
  constructor(private readonly akcje: AkcjeKontaOperatoraService) {}

  @Post('haslo-skrzynki')
  @HttpCode(200)
  hasloSkrzynki(@Param('id') id: string, @Body() b: ResetHaslaSkrzynkiDto, @CurrentUser() actor: Aktor) {
    return this.akcje.resetHaslaSkrzynki(zlecenie(id, actor, b), b.email);
  }

  @Post('haslo-ftp')
  @HttpCode(200)
  hasloFtp(@Param('id') id: string, @Body() b: ResetHaslaFtpDto, @CurrentUser() actor: Aktor) {
    return this.akcje.resetHaslaFtp(zlecenie(id, actor, b), b.username);
  }

  @Post('haslo-bazy')
  @HttpCode(200)
  hasloBazy(@Param('id') id: string, @Body() b: ResetHaslaBazyDto, @CurrentUser() actor: Aktor) {
    return this.akcje.resetHaslaBazy(zlecenie(id, actor, b), b.db, b.user);
  }

  @Post('ssl')
  @HttpCode(200)
  ssl(@Param('id') id: string, @Body() b: SslOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.ssl(zlecenie(id, actor, b), b.domain, b.includeWww === true);
  }

  @Post('php')
  @HttpCode(200)
  php(@Param('id') id: string, @Body() b: PhpOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.wersjaPhp(zlecenie(id, actor, b), b.version);
  }

  @Post('kopia')
  @HttpCode(200)
  kopia(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.kopia(zlecenie(id, actor, b));
  }

  @Post('skan')
  @HttpCode(200)
  skan(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.skan(zlecenie(id, actor, b));
  }

  /** F3.2 (G-12) — kwarantanna wykrytych plików (odwracalna: kopia w ~/.verris-kwarantanna). */
  @Post('kwarantanna')
  @HttpCode(200)
  kwarantanna(@Param('id') id: string, @Body() b: KwarantannaOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.kwarantanna(zlecenie(id, actor, b), b.sciezki);
  }

  @Post('kwarantanna/przywroc')
  @HttpCode(200)
  przywrocZKwarantanny(@Param('id') id: string, @Body() b: PrzywrocZKwarantannyOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.przywrocZKwarantanny(zlecenie(id, actor, b), b.wpisy);
  }

  @Post('dns')
  @HttpCode(200)
  @StaffPerm('DNS_MANAGE')
  dnsDodaj(@Param('id') id: string, @Body() b: DodajRekordDnsOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.dnsDodaj(zlecenie(id, actor, b), { domain: b.domain, name: b.name, type: b.type, value: b.value, ttl: b.ttl });
  }

  @Post('dns/zmien')
  @HttpCode(200)
  @StaffPerm('DNS_MANAGE')
  dnsZmien(@Param('id') id: string, @Body() b: ZmienRekordDnsOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.dnsZmien(zlecenie(id, actor, b), { domain: b.domain, old: b.old, next: b.next });
  }

  @Post('dns/usun')
  @HttpCode(200)
  @StaffPerm('DNS_MANAGE')
  dnsUsun(@Param('id') id: string, @Body() b: UsunRekordDnsOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.akcje.dnsUsun(zlecenie(id, actor, b), { domain: b.domain, name: b.name, type: b.type, value: b.value });
  }
}

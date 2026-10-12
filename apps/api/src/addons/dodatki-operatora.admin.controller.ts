import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm, StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { WniosekMozliwy } from '../wnioski/wniosek-mozliwy.decorator.js';
import { PowodOperatoraDto } from '../subscriptions/dto/akcje-konta.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddonService, PLATNOSCI_DODATKU, SLUGI_DODATKOW, type PlatnoscDodatku } from './addon.service.js';

export class DodatekOperatoraDto extends PowodOperatoraDto {
  @IsIn(SLUGI_DODATKOW) slug!: string;
  @IsIn(PLATNOSCI_DODATKU) platnosc!: PlatnoscDodatku;
  /** Klucz jednej decyzji z formularza (podwójny klik nie doda dwóch dodatków). */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) @Matches(/^[A-Za-z0-9._:-]+$/) klucz?: string;
  /** Weryfikacja 11.10 — jawna zgoda na przedłużenie aktywnego dodatku czasowego (bez niej — 409). */
  @IsOptional() @IsBoolean() przedluz?: boolean;
}

/**
 * F3.5 — dodatki dodawane przez obsługę na karcie usługi (sekcja „Operacje”), przez istniejący sklep dodatków
 * (AddonService, P-8). Podgląd katalogu i dodatków klienta — jak odczyt karty usługi. Dodanie ma koszt (portfel
 * klienta albo gratis = koszt Verris), więc D2: BILLING_MANAGE + SUBSCRIPTIONS_MANAGE (L4); niżej wniosek ADDON_ADD.
 */
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('SUBSCRIPTIONS_MANAGE')
export class DodatkiOperatoraAdminController {
  constructor(
    private readonly addons: AddonService,
    private readonly prisma: PrismaService,
  ) {}

  /** Audyt Fali 3 (D3) — zakupy usług kont zespołu widzi tylko ADMIN (jak dodanie dodatku w addon.service.ts). */
  @Get(':id/dodatki')
  @StaffPermAny('CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE')
  async dodatki(@Param('id') id: string, @CurrentUser() actor: { userId: string; role: string }) {
    const s = await this.prisma.subscription.findUnique({ where: { id }, select: { userId: true, user: { select: { role: true } } } });
    if (!s) throw new NotFoundException('Usługa nie istnieje.');
    if (actor.role !== 'ADMIN' && s.user?.role !== 'USER') {
      throw new ForbiddenException('Personel widzi dodatki wyłącznie usług klientów — usługę konta zespołu sprawdza administrator.');
    }
    return this.addons.overview(s.userId);
  }

  @Post(':id/dodatki')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE', 'SUBSCRIPTIONS_MANAGE')
  @WniosekMozliwy('ADDON_ADD')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:dodatki-operatora' })
  dodaj(@Param('id') id: string, @Body() b: DodatekOperatoraDto, @CurrentUser() actor: { userId: string; role: string }) {
    return this.addons.dodajPrzezOperatora({
      subscriptionId: id,
      slug: b.slug,
      platnosc: b.platnosc,
      operator: { userId: actor.userId, role: actor.role },
      powod: b.powod,
      zgloszenie: b.zgloszenie,
      klucz: b.klucz ? `panel:${b.klucz}` : null,
      przedluz: b.przedluz === true,
    });
  }
}

/** M-33 — „Zrealizowano”: notatka dla klienta opcjonalna (np. „Przydzielono IP …”). */
export class RealizacjaZleceniaDto {
  @IsOptional() @IsString() @MaxLength(1000) notatka?: string;
}

/** M-33 — „Odmowa ze zwrotem”: powód obowiązkowy (klient go zobaczy). */
export class OdmowaZleceniaDto {
  @IsString() @MinLength(10) @MaxLength(1000) powod!: string;
}

/**
 * M-33 — zlecenia dodatków (dedykowane IP, konfiguracja przez specjalistę) zamykane przez zespół ze strony zgłoszenia
 * „Dodatek: …”. Podgląd — kto widzi zgłoszenia albo zarządza usługami. „Zrealizowano” (bez pieniędzy) — SUBSCRIPTIONS_MANAGE
 * (L2+, NOC), jak zmiany usług. „Odmowa ze zwrotem” rusza portfel klienta — te same uprawnienia co dodanie dodatku przez
 * obsługę (BILLING_MANAGE + SUBSCRIPTIONS_MANAGE, L4; decyzja 08.10: portfel od L4).
 */
@Controller('admin/dodatki')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('SUBSCRIPTIONS_MANAGE')
export class ZleceniaDodatkowAdminController {
  constructor(private readonly addons: AddonService) {}

  @Get('zgloszenie/:ticketId')
  @StaffPermAny('TICKETS_VIEW', 'SUBSCRIPTIONS_MANAGE')
  zgloszenia(@Param('ticketId', ParseUUIDPipe) ticketId: string, @CurrentUser() actor: { userId: string; role: string }) {
    return this.addons.zleceniaZgloszenia(ticketId, actor);
  }

  @Post(':id/zrealizowano')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:zlecenia-dodatkow' })
  zrealizowano(@Param('id', ParseUUIDPipe) id: string, @Body() b: RealizacjaZleceniaDto, @CurrentUser() actor: { userId: string; role: string }) {
    return this.addons.zamknijZlecenie({ zakupId: id, wynik: 'ZREALIZOWANO', operator: { userId: actor.userId, role: actor.role }, tekst: b.notatka });
  }

  @Post(':id/odmowa')
  @HttpCode(200)
  @StaffPerm('BILLING_MANAGE', 'SUBSCRIPTIONS_MANAGE')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'admin:zlecenia-dodatkow-odmowa' })
  odmowa(@Param('id', ParseUUIDPipe) id: string, @Body() b: OdmowaZleceniaDto, @CurrentUser() actor: { userId: string; role: string }) {
    return this.addons.zamknijZlecenie({ zakupId: id, wynik: 'ODMOWA', operator: { userId: actor.userId, role: actor.role }, tekst: b.powod });
  }
}

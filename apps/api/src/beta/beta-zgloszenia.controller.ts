import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BetaZgloszenieStatus, Role } from '@verris/database';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { CaptchaService } from '../auth/captcha.service.js';
import { CSP_STRONY_LINKU, stronaLinku } from '../common/strona-linku.js';
import { BetaZgloszeniaService, type StanLinkuBety, type WynikPotwierdzeniaBety } from './beta-zgloszenia.service.js';
import { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';

export class OdrzucZgloszenieDto {
  @IsOptional() @IsBoolean() powiadom?: boolean;
}

export class PotwierdzLinkDto {
  @IsOptional() @IsString() @MaxLength(100) token?: string;
}

export class ListaZgloszenQuery {
  @IsOptional() @IsIn(Object.values(BetaZgloszenieStatus)) status?: BetaZgloszenieStatus;
}

/**
 * Otwarta beta — formularz verris.pl/beta. Bez auth: captcha jak przy leadach, limit 5/godz. per IP i per adres
 * (keyByBodyField), pułapka na boty (pole „pulapka”) i najwyżej jeden mail na adres na dobę w serwisie.
 */
@Controller('public/beta')
export class BetaZgloszeniaPublicController {
  constructor(
    private readonly zgloszenia: BetaZgloszeniaService,
    private readonly captcha: CaptchaService,
  ) {}

  @Post('zgloszenia')
  @HttpCode(202)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'beta:zgloszenie', keyByBodyField: 'email' })
  async zglos(@Body() dto: ZgloszenieBetaDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'] as string | undefined;
    await this.captcha.verify(dto.captchaToken, ip, 'lead');
    return this.zgloszenia.zglos(dto, { ip, userAgent });
  }

  /**
   * A1-06 — GET niczego nie zmienia (linki z maili otwierają też skanery poczty, np. Safe Links): pokazuje stronę
   * z przyciskiem, a potwierdza dopiero POST. P5-09 — drugie otwarcie linku mówi „już potwierdzone”.
   * A1-05 — własne CSP trasy: Caddy (`header ?Content-Security-Policy`) nie nadpisuje go, więc inline `<style>` działa.
   */
  @Get('zgloszenia/potwierdz')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async potwierdzStrona(@Query('token') token?: string): Promise<string> {
    const stan = await this.zgloszenia.stanLinku(token);
    if (stan === 'DO_POTWIERDZENIA' || stan === 'ZMIANA_DO_POTWIERDZENIA') {
      const zmiana = stan === 'ZMIANA_DO_POTWIERDZENIA';
      return stronaLinku(
        zmiana ? 'Potwierdź zmianę zgłoszenia' : 'Potwierdź zgłoszenie do testów',
        zmiana
          ? 'Kliknij przycisk, żeby zapisać nowe dane zgłoszenia. Bez tego zostaje to, co zgłosiłeś wcześniej.'
          : 'Jeszcze jeden krok: kliknij przycisk, żeby Twoje zgłoszenie trafiło na listę testerów.',
        { token: token!, etykieta: zmiana ? 'Potwierdzam zmianę' : 'Potwierdzam zgłoszenie', akcja: '/public/beta/zgloszenia/potwierdz' },
      );
    }
    return stronaWyniku(stan);
  }

  @Post('zgloszenia/potwierdz')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'beta:potwierdz' })
  async potwierdz(@Body() body: PotwierdzLinkDto, @Query('token') tokenZAdresu?: string): Promise<string> {
    const { stan } = await this.zgloszenia.potwierdz(body?.token || tokenZAdresu);
    return stronaWyniku(stan);
  }
}

function stronaWyniku(stan: WynikPotwierdzeniaBety | StanLinkuBety): string {
  switch (stan) {
    case 'POTWIERDZONE':
      return stronaLinku('Zgłoszenie potwierdzone ✓', 'Dziękujemy! Twoje zgłoszenie do testów Verris jest na liście. Zapraszamy małymi grupami – gdy przyjdzie Twoja kolej, wyślemy zaproszenie z imiennym kodem na ten adres.');
    case 'ZMIANA_ZAPISANA':
      return stronaLinku('Zmiana zapisana ✓', 'Nowe dane Twojego zgłoszenia są zapisane. Zgłoszenie dalej czeka na liście – zaproszenie z kodem przyjdzie na ten adres.');
    case 'JUZ_POTWIERDZONE':
      return stronaLinku('Zgłoszenie jest już potwierdzone ✓', 'Ten adres jest już potwierdzony – nic więcej nie musisz robić. Gdy przyjdzie Twoja kolej, wyślemy zaproszenie z imiennym kodem na ten adres.');
    default:
      return stronaLinku('Link nieaktualny', 'Ten link wygasł albo został już wykorzystany. Jeśli chcesz zgłosić się do testów, wypełnij formularz na verris.pl/beta – wyślemy nowy link.', undefined, true);
  }
}

/** Otwarta beta — zgłoszenia w panelu admina (te same strażniki i uprawnienie co zaproszenia). */
@Controller('admin/beta/zgloszenia')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('PROMO_MANAGE')
export class BetaZgloszeniaAdminController {
  constructor(private readonly zgloszenia: BetaZgloszeniaService) {}

  @Get()
  lista(@Query() q: ListaZgloszenQuery) {
    return this.zgloszenia.lista(q.status);
  }

  @Post(':id/zapros')
  @HttpCode(201)
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:beta-invite' })
  zapros(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: { userId: string }) {
    return this.zgloszenia.zapros(id, actor.userId);
  }

  @Post(':id/odrzuc')
  @HttpCode(200)
  odrzuc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OdrzucZgloszenieDto, @CurrentUser() actor: { userId: string }) {
    return this.zgloszenia.odrzuc(id, Boolean(dto.powiadom), actor.userId);
  }
}

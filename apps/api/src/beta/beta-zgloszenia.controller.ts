import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { BetaZgloszenieStatus, Role } from '@verris/database';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { CaptchaService } from '../auth/captcha.service.js';
import { BetaZgloszeniaService } from './beta-zgloszenia.service.js';
import { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';

export class OdrzucZgloszenieDto {
  @IsOptional() @IsBoolean() powiadom?: boolean;
}

export class ListaZgloszenQuery {
  @IsOptional() @IsIn(Object.values(BetaZgloszenieStatus)) status?: BetaZgloszenieStatus;
}

/**
 * Otwarta beta — formularz verris.pl/beta. Bez auth: captcha jak przy leadach, limit 5/godz. per IP i per adres
 * (keyByBodyField), pułapka na boty (pole „firma”) i najwyżej jeden mail na adres na dobę w serwisie.
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

  @Get('zgloszenia/potwierdz')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async potwierdz(@Query('token') token?: string): Promise<string> {
    const { ok } = await this.zgloszenia.potwierdz(token);
    const title = ok ? 'Zgłoszenie potwierdzone ✓' : 'Link nieaktualny';
    const body = ok
      ? 'Dziękujemy! Twoje zgłoszenie do testów Verris jest na liście. Zapraszamy małymi grupami — gdy przyjdzie Twoja kolej, wyślemy zaproszenie z imiennym kodem na ten adres.'
      : 'Ten link jest nieaktualny albo zgłoszenie zostało już potwierdzone. Jeśli to pomyłka, wypełnij formularz ponownie na verris.pl/beta.';
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0C1A14;color:#F4F4EE;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:460px;background:#0E1F17;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px}
h1{font-size:22px;margin:0 0 12px;color:#34E5A0}p{margin:0;color:#B4C2BB;line-height:1.55}
a{display:inline-block;margin-top:20px;color:#34E5A0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p><a href="https://verris.pl">← Wróć na verris.pl</a></div></body></html>`;
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

import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Query, Req } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { LeadsService } from './leads.service.js';
import { SubmitLeadDto } from './dto/submit-lead.dto.js';
import { SubmitCallbackDto } from './dto/submit-callback.dto.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { CaptchaService } from '../auth/captcha.service.js';
import { CSP_STRONY_LINKU, stronaLinku } from '../common/strona-linku.js';

/** Formularz ze strony potwierdzenia/wypisu — token w treści (application/x-www-form-urlencoded). */
export class TokenDto {
  @IsOptional() @IsString() @MaxLength(200) token?: string;
}

/**
 * Publiczne formularze z verris.pl (LP „Zaplanuj migrację" + „Kontakt").
 * Bez auth, pod globalnym RateLimitGuard (per-IP). www forwarduje IP/User-Agent
 * użytkownika nagłówkami (x-forwarded-for) — endpoint je odczytuje do dowodu zgody.
 */
@Controller('public/leads')
export class LeadsPublicController {
  constructor(
    private readonly leads: LeadsService,
    private readonly captcha: CaptchaService,
  ) {}

  // Audyt bezpieczeństwa 13.10: formularz wysyła mail z naszej domeny na adres podany przez anonima —
  // limit per IP i per adres odbiorcy (keyByBodyField), żeby nie dało się nim zasypać cudzej skrzynki.
  @Post()
  @HttpCode(202)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'leads:submit', keyByBodyField: 'email' })
  async submit(@Body() dto: SubmitLeadDto, @Req() req: Request) {
    const ip =
      req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'] as string | undefined;
    // Decyzja 14.10: captcha jak przy rejestracji. Gdy CAPTCHA_SECRET_KEY nie jest ustawiony, CaptchaService
    // przepuszcza (tak samo działa logowanie i rejestracja) — limity per IP i adres zostają.
    await this.captcha.verify(dto.captchaToken, ip, 'lead');
    return this.leads.submit(dto, { ip, userAgent });
  }

  /**
   * 1.11 — pas „Wolisz porozmawiać?”: prośba o telefon zwrotny. Bez maila do nadawcy (nie podaje adresu), więc limit
   * per IP i per numer (keyByBodyField) chroni zespół przed zasypaniem zgłoszeniami na jeden numer.
   */
  @Post('callback')
  @HttpCode(202)
  @RateLimit({ limit: 3, windowMs: 60 * 60 * 1000, scope: 'leads:callback', keyByBodyField: 'phone' })
  async callback(@Body() dto: SubmitCallbackDto, @Req() req: Request) {
    const ip =
      req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'] as string | undefined;
    await this.captcha.verify(dto.captchaToken, ip, 'lead');
    return this.leads.submitCallback(dto, { ip, userAgent });
  }

  /**
   * A2-01 — potwierdzenie zgody na wiadomości (double opt-in). GET pokazuje stronę z przyciskiem, zapis robi POST:
   * skanery linków w poczcie firmowej otwierają linki GET-em i potwierdzałyby zgodę za człowieka (jak A1-06).
   */
  @Get('confirm')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async confirmStrona(@Query('token') token?: string): Promise<string> {
    if (!token?.trim()) throw new BadRequestException('Brak tokenu – użyj linku z wiadomości.');
    if (!(await this.leads.tokenPotwierdzeniaIstnieje(token))) return NIEAKTUALNY;
    return stronaLinku(
      'Potwierdzić zgodę na wiadomości?',
      'Po kliknięciu będziemy czasem wysyłać Ci wiadomości o hostingu Verris. Rezygnacja jednym kliknięciem w każdej wiadomości.',
      { token, etykieta: 'Potwierdzam zgodę', akcja: '/public/leads/confirm' },
    );
  }

  @Post('confirm')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async confirm(@Body() body: TokenDto): Promise<string> {
    if (!body?.token?.trim()) throw new BadRequestException('Brak tokenu – użyj linku z wiadomości.');
    const { ok } = await this.leads.confirm(body.token.trim());
    if (!ok) return NIEAKTUALNY;
    return stronaLinku(
      'Zgoda potwierdzona ✓',
      'Dziękujemy. Wiadomości o hostingu Verris będą przychodzić rzadko, a z każdej wypiszesz się jednym kliknięciem.',
    );
  }

  /** A2-01 — wypis z wiadomości o hostingu (link z planu migracji). GET bez skutków, wypis robi POST. */
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async unsubscribeStrona(@Query('token') token?: string): Promise<string> {
    if (!token?.trim()) throw new BadRequestException('Brak tokenu wypisu – użyj linku z wiadomości.');
    const stan = await this.leads.tokenWypisu(token);
    if (stan === 'brak') {
      return stronaLinku('Link nieaktualny', 'Ten link do wypisu jest nieprawidłowy albo dane zostały już usunięte. Napisz na kontakt@verris.pl, jeśli dalej dostajesz wiadomości.', undefined, true);
    }
    if (stan === 'wypisany') return WYPISANO;
    return stronaLinku(
      'Wypisać Cię z wiadomości Verris?',
      'Po kliknięciu nie wyślemy Ci już żadnej wiadomości o hostingu Verris.',
      { token, etykieta: 'Wypisz mnie', akcja: '/public/leads/unsubscribe' },
    );
  }

  @Post('unsubscribe')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async unsubscribe(@Query('token') tokenZAdresu: string | undefined, @Body() body: TokenDto): Promise<string> {
    const token = tokenZAdresu?.trim() || body?.token?.trim();
    const { ok } = await this.leads.unsubscribe(token);
    return ok ? WYPISANO : stronaLinku('Link nieaktualny', 'Ten link do wypisu jest nieprawidłowy albo dane zostały już usunięte.', undefined, true);
  }
}

const NIEAKTUALNY = stronaLinku(
  'Link nieaktualny',
  'Ten link jest nieaktualny albo został już użyty. Jeśli to pomyłka, wypełnij formularz ponownie na verris.pl.',
  undefined,
  true,
);
const WYPISANO = stronaLinku('Wypisano ✓', 'Nie wyślemy Ci już wiadomości o hostingu Verris.');

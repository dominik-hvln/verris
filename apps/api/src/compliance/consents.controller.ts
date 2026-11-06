import {
  BadRequestException,
  ForbiddenException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { extractRequestContext } from '../common/decorators/request-context.js';
import { ConsentsService } from './consents.service.js';
import { MarketingPreferencesService } from './marketing-preferences.service.js';
import { CSP_STRONY_LINKU, stronaLinku } from '../common/strona-linku.js';

/** Formularz ze strony wypisu (A1-06) — token w treści; one-click RFC 8058 wysyła `List-Unsubscribe=One-Click`. */
export class WypisDto {
  @IsOptional() @IsString() @MaxLength(200) token?: string;
  @IsOptional() @IsString() @MaxLength(40) 'List-Unsubscribe'?: string;
}

class UpdateMarketingPrefsDto {
  @IsOptional()
  @IsBoolean()
  marketingEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdatesEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  partnerOffersEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  loginAlertsEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  autoscalingEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  quotaAlertsEmail?: boolean;
}

/**
 * Per-user consent and marketing endpoints (Sprint 1, L-04 / L-05).
 *
 * Routes (all require JWT):
 *  - `GET    /me/consent/status`           — what the user has accepted vs current
 *  - `POST   /me/consent/accept-current`   — re-consent modal submit
 *  - `GET    /me/consent/history`          — full consent history (settings tab)
 *  - `GET    /me/marketing-preferences`    — read marketing toggles
 *  - `PATCH  /me/marketing-preferences`    — update marketing toggles
 *
 * Public endpoint (no auth, served from same controller for proximity):
 *  - `GET    /unsubscribe?token=...`       — RFC 8058 one-click unsubscribe
 */
/**
 * Zgoda musi pochodzić od klienta (RODO art. 7 ust. 1 — administrator ma ją wykazać). Operator
 * w sesji wsparcia (impersonacja) nie akceptuje dokumentów ani nie zmienia zgód marketingowych
 * w imieniu klienta — taki wpis byłby fałszywym dowodem zgody.
 */
export function tylkoKlient(user: { impersonatedBy?: string; customerOwnerId?: string | null }): void {
  if (user.impersonatedBy) {
    throw new ForbiddenException('Zgody akceptuje wyłącznie klient – nie w sesji wsparcia.');
  }
  // Subkonto / członkostwo działa na koncie właściciela (userId = właściciel): wpis byłby zgodą
  // właściciela złożoną przez inną osobę (w tym wyłączenie jego alertów logowania).
  if (user.customerOwnerId) {
    throw new ForbiddenException('Dokumenty i zgody konta akceptuje wyłącznie jego właściciel.');
  }
}

@Controller()
export class ConsentsController {
  constructor(
    private readonly consents: ConsentsService,
    private readonly marketingPrefs: MarketingPreferencesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Authenticated user routes
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('me/consent/status')
  // Audyt 13.10: subkonto/członek zespołu widziało modal zgód WŁAŚCICIELA i nie mogło go zaakceptować (403) —
  // panel stał zablokowany. Regulamin akceptuje osoba z sesji, więc i status, i akceptacja są jej.
  status(@CurrentUser() user: { userId: string; principalUserId?: string }) {
    return this.consents.checkReConsent(user.principalUserId ?? user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/consent/history')
  // Audyt 13.10: historia zgód (IP, przeglądarka) osoby z sesji, nie właściciela konta nadrzędnego.
  history(@CurrentUser() user: { userId: string; principalUserId?: string }) {
    return this.consents.listForUser(user.principalUserId ?? user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/consent/accept-current')
  @HttpCode(HttpStatus.OK)
  async acceptCurrent(
    @CurrentUser() user: { userId: string; principalUserId?: string; impersonatedBy?: string; customerOwnerId?: string | null },
    @Req() req: Request,
  ) {
    if (user.impersonatedBy) tylkoKlient(user);
    // Subkonto akceptuje dokumenty za siebie (osoba z sesji), nigdy za właściciela konta.
    const osoba = user.customerOwnerId ? user.principalUserId : user.userId;
    if (!osoba || (user.customerOwnerId && osoba === user.userId)) tylkoKlient(user);
    const ctx = extractRequestContext(req);
    await this.consents.acceptCurrent(osoba!, ctx);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/consent/accept-dpa')
  @HttpCode(HttpStatus.OK)
  async acceptDpa(@CurrentUser() user: { userId: string; impersonatedBy?: string; customerOwnerId?: string | null }, @Req() req: Request) {
    tylkoKlient(user);
    const ctx = extractRequestContext(req);
    return this.consents.acceptDpa(user.userId, ctx);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/marketing-preferences')
  getPrefs(@CurrentUser() user: { userId: string }) {
    return this.marketingPrefs.get(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/marketing-preferences')
  updatePrefs(
    @CurrentUser() user: { userId: string; impersonatedBy?: string; customerOwnerId?: string | null },
    @Body() dto: UpdateMarketingPrefsDto,
    @Req() req: Request,
  ) {
    tylkoKlient(user);
    return this.marketingPrefs.update(user.userId, dto, extractRequestContext(req));
  }

  // ---------------------------------------------------------------------------
  // Public RFC 8058 one-click unsubscribe
  // ---------------------------------------------------------------------------

  /**
   * A1-06 (paczka 109) — link „Wypisz się” z maila: GET tylko pokazuje stronę z przyciskiem (skanery linków w poczcie
   * firmowej otwierają linki GET-em i wypisywały klienta bez jego wiedzy), wypis robi POST. Brak tokenu → 400
   * z ludzkim komunikatem (wcześniej wyjątek Prisma → 500 i surowy JSON z adresem e-mail).
   */
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async unsubscribe(@Query('token') token?: string): Promise<string> {
    if (!token?.trim()) throw new BadRequestException('Brak tokenu wypisu – użyj linku z wiadomości.');
    if (!(await this.marketingPrefs.tokenWypisuIstnieje(token))) {
      return stronaLinku('Link nieaktualny', 'Ten link do wypisu jest nieprawidłowy. Zgody na wiadomości zmienisz też w panelu: Ustawienia → Prywatność.', undefined, true);
    }
    return stronaLinku(
      'Wypisać Cię z wiadomości Verris?',
      'Po kliknięciu nie będziemy wysyłać Ci newslettera, nowości ani ofert partnerskich. Wiadomości o koncie, płatnościach i bezpieczeństwie dalej będą przychodzić.',
      { token, etykieta: 'Wypisz mnie', akcja: '/unsubscribe' },
    );
  }

  /**
   * RFC 8058 mandates this exact URL is reachable via POST too, with header
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mailbox providers
   * (Gmail, Outlook) call it without user interaction (token w adresie). Formularz ze strony GET wysyła token w treści.
   */
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', CSP_STRONY_LINKU)
  async unsubscribePost(@Query('token') tokenZAdresu: string | undefined, @Body() body: WypisDto, @Req() req: Request): Promise<string> {
    const token = tokenZAdresu?.trim() || body?.token?.trim();
    if (!token) throw new BadRequestException('Brak tokenu wypisu – użyj linku z wiadomości.');
    await this.marketingPrefs.oneClickUnsubscribe(token, extractRequestContext(req));
    return stronaLinku('Wypisano ✓', 'Nie będziemy już wysyłać Ci wiadomości marketingowych. Zgody zmienisz w każdej chwili w panelu: Ustawienia → Prywatność.');
  }
}

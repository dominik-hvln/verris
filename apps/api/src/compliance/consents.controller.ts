import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractRequestContext } from '../common/decorators/request-context';
import { ConsentsService } from './consents.service';
import { MarketingPreferencesService } from './marketing-preferences.service';

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
  status(@CurrentUser() user: { userId: string }) {
    return this.consents.checkReConsent(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/consent/history')
  history(@CurrentUser() user: { userId: string }) {
    return this.consents.listForUser(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/consent/accept-current')
  @HttpCode(HttpStatus.OK)
  async acceptCurrent(@CurrentUser() user: { userId: string }, @Req() req: Request) {
    const ctx = extractRequestContext(req);
    await this.consents.acceptCurrent(user.userId, ctx);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/consent/accept-dpa')
  @HttpCode(HttpStatus.OK)
  async acceptDpa(@CurrentUser() user: { userId: string }, @Req() req: Request) {
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
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateMarketingPrefsDto,
    @Req() req: Request,
  ) {
    return this.marketingPrefs.update(user.userId, dto, extractRequestContext(req));
  }

  // ---------------------------------------------------------------------------
  // Public RFC 8058 one-click unsubscribe
  // ---------------------------------------------------------------------------

  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Req() req: Request) {
    const result = await this.marketingPrefs.oneClickUnsubscribe(
      token,
      extractRequestContext(req),
    );
    return {
      ok: true,
      message: 'Wypisano z subskrypcji marketingowej',
      email: result.userEmail,
    };
  }

  /**
   * RFC 8058 mandates this exact URL is reachable via POST too, with header
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mailbox providers
   * (Gmail, Outlook) call it without user interaction. Same handler.
   */
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribePost(@Query('token') token: string, @Req() req: Request) {
    return this.unsubscribe(token, req);
  }
}

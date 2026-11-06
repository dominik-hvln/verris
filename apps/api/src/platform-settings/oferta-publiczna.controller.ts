import { Controller, Get, HttpCode } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service.js';

/**
 * Publiczne warunki oferty dla verris.pl (bez logowania, jak GET /plans; GET /public/oferta/kredyty-startowe): decyzja 1.11.2026 — kwoty na stronie
 * z realnych ustawień, nie wpisane w kod. Decyzja 6.11.2026 — kredyty na autoskalowanie przy pierwszym zakupie
 * hostingu zamiast rabatu na start.
 */
@Controller('public/oferta')
export class OfertaPublicznaController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('kredyty-startowe')
  @HttpCode(200)
  async kredytyStartowe(): Promise<{ wlaczone: boolean; rocznie: number; miesiecznie: number; waznoscMiesiecy: number }> {
    const o = await this.settings.getTrialOffer();
    return {
      wlaczone: o.cardEnabled && (o.annualAutoscalingCredit > 0 || o.monthlyAutoscalingCredit > 0),
      rocznie: o.annualAutoscalingCredit,
      miesiecznie: o.monthlyAutoscalingCredit,
      waznoscMiesiecy: o.autoscalingCreditValidityMonths,
    };
  }
}

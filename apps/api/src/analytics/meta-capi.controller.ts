import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MetaCapiService } from './meta-capi.service';
import { MetaCapiPurchaseDto } from './dto/meta-capi.dto';

/**
 * Przekaźnik zdarzeń do Meta Conversions API. Wołany z panelu (server action)
 * po udanym zakupie — WYŁĄCZNIE gdy klient ma zgodę marketingową (bramkowanie
 * po stronie panelu). IP/User-Agent/fbp/fbc przekazuje panel z żądania użytkownika,
 * żeby dopasowanie (EMQ) opierało się na danych użytkownika, nie kontenera panelu.
 */
@Controller('analytics/meta')
@UseGuards(JwtAuthGuard)
export class MetaCapiController {
  constructor(private readonly capi: MetaCapiService) {}

  @Post('purchase')
  @HttpCode(202)
  async purchase(
    @CurrentUser() user: { userId: string },
    @Body() dto: MetaCapiPurchaseDto,
    @Req() req: Request,
  ): Promise<{ received: true }> {
    // Fallback na IP/UA z bezpośredniego żądania, gdy panel ich nie przekazał.
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    const clientIp = dto.clientIp || forwarded || req.ip;
    const userAgent = dto.userAgent || (req.headers['user-agent'] as string | undefined);

    // Best-effort — nie czekamy i nie przerywamy odpowiedzi przy błędzie CAPI.
    void this.capi.sendPurchase({
      eventId: dto.eventId,
      userId: user.userId,
      value: dto.value,
      currency: dto.currency || 'PLN',
      contentName: dto.contentName,
      eventSourceUrl: dto.eventSourceUrl,
      clientIp,
      userAgent,
      fbp: dto.fbp,
      fbc: dto.fbc,
    });

    return { received: true };
  }
}

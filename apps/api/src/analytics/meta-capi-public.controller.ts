import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MetaCapiService } from './meta-capi.service';
import { MetaCapiLeadDto } from './dto/meta-capi.dto';

/**
 * Publiczny przekaźnik Lead do Meta CAPI (verris.pl nie ma zalogowanego usera).
 * BEZ auth, ale pod globalnym RateLimitGuard (per-IP). Wysyła wyłącznie parametry
 * techniczne — bez e-maila. Bramkowanie zgodą po stronie www (relay tylko po zgodzie).
 */
@Controller('analytics/meta')
export class MetaCapiPublicController {
  constructor(private readonly capi: MetaCapiService) {}

  @Post('lead')
  @HttpCode(202)
  async lead(@Body() dto: MetaCapiLeadDto, @Req() req: Request): Promise<{ received: true }> {
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    void this.capi.sendLead({
      eventId: dto.eventId,
      method: dto.method,
      eventSourceUrl: dto.eventSourceUrl,
      clientIp: dto.clientIp || forwarded || req.ip,
      userAgent: dto.userAgent || (req.headers['user-agent'] as string | undefined),
      fbp: dto.fbp,
      fbc: dto.fbc,
    });
    return { received: true };
  }
}

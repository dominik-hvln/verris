import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { AbuseService } from './abuse.service';
import { ZgloszenieNaduzyciaDto } from './abuse.dto';

/** N-13 — publiczny formularz zgłoszeń (verris.pl/zglos-naduzycie). */
@Controller('public/abuse')
export class AbusePublicController {
  constructor(private readonly abuse: AbuseService) {}

  @Post()
  @HttpCode(202)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'public:abuse' })
  zglos(@Body() dto: ZgloszenieNaduzyciaDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return this.abuse.zglos(dto, { ip, userAgent: req.headers['user-agent'] as string | undefined });
  }
}

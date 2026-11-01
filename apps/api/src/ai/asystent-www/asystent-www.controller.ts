import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit } from '../../common/guards/rate-limit.guard.js';
import { AsystentWwwService, type OdpowiedzAsystenta } from './asystent-www.service.js';
import { PytanieAsystentaDto } from './dto/pytanie-asystenta.dto.js';

/**
 * Asystent AI na verris.pl (1.11.2026). Publiczny, bez konta: limit 20 pytań / 10 min per IP (tu),
 * 60 / dobę per IP, ≤12 wymian w rozmowie, captcha od 4. wiadomości i limity kosztu — w serwisie.
 * www forwarduje IP użytkownika nagłówkiem x-forwarded-for (jak formularze leadów).
 */
@Controller('public/asystent')
export class AsystentWwwController {
  constructor(private readonly asystent: AsystentWwwService) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 10 * 60 * 1000, scope: 'asystent:pytanie' })
  async zapytaj(@Body() dto: PytanieAsystentaDto, @Req() req: Request): Promise<OdpowiedzAsystenta> {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const { rozmowaId, odpowiedz, zrodla, nieWiem } = await this.asystent.zapytaj(dto, { ip });
    // Bez kosztu w odpowiedzi publicznej.
    return { rozmowaId, odpowiedz, zrodla, nieWiem };
  }
}

import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FontsProxyService } from './fonts-proxy.service';

/**
 * FONT-1 — publiczne endpointy proxy/CDN fontów (bez uwierzytelniania):
 *  - GET /fonts/css2?family=...&display=swap  → CSS z URL-ami plików na Verris
 *  - GET /fonts/file?u=<gstatic-url>          → plik WOFF2 (cache'owany)
 * Odwiedzający stronę klienta łączy się wyłącznie z Verris (RODO).
 */
@Controller('fonts')
export class FontsProxyController {
  constructor(private readonly fonts: FontsProxyService) {}

  @Get('css2')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Access-Control-Allow-Origin', '*')
  async css2(@Query() query: Record<string, string>): Promise<string> {
    // Odtwórz surowy querystring z parametrów (zachowując family/wght/display/…).
    const qs = new URLSearchParams(query).toString();
    return this.fonts.css(qs);
  }

  @Get('file')
  async file(@Query('u') u: string, @Res() res: Response): Promise<void> {
    const { buf, type } = await this.fonts.file(u);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(buf);
  }
}

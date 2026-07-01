import { Body, Controller, Get, Header, HttpCode, Ip, Post, Headers } from '@nestjs/common';
import { AnalyticsSitesService } from './analytics-sites.service';

interface CollectBody {
  k?: string; // siteKey
  p?: string; // path
  r?: string; // referrer
}

/**
 * AN — publiczne endpointy analityki (bez uwierzytelniania):
 *  - GET  /analytics/a.js       — skrypt trackera (cache'owalny, bez cookies)
 *  - POST /analytics/collect    — rejestracja odsłony (sendBeacon/fetch)
 * IP i User-Agent są używane wyłącznie do jednodniowego hasha odwiedzającego,
 * NIE są zapisywane w bazie.
 */
@Controller('analytics')
export class AnalyticsPublicController {
  constructor(private readonly analytics: AnalyticsSitesService) {}

  @Get('a.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  script(): string {
    return this.analytics.trackerScript();
  }

  @Post('collect')
  @HttpCode(204)
  async collect(
    @Body() body: CollectBody,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
    @Headers('cf-ipcountry') cfCountry?: string,
    @Headers('x-geo-country') xCountry?: string,
  ): Promise<void> {
    if (!body?.k || !body?.p) return;
    await this.analytics
      .collect({
        siteKey: String(body.k).slice(0, 64),
        path: String(body.p).slice(0, 1024),
        referrer: body.r ? String(body.r).slice(0, 2048) : null,
        ip: ip || '0.0.0.0',
        userAgent: ua ?? '',
        country: cfCountry || xCountry || null,
      })
      .catch(() => undefined);
  }
}

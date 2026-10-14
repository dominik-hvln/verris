import { All, Controller, Get, NotFoundException, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PodgladService } from './podglad.service.js';

/**
 * 15.10 — podgląd strony przed zmianą DNS. Ruch z `<token>.<PODGLAD_DOMENA>` Caddy przepisuje na `/podglad-proxy{uri}`
 * (jak pomoc.verris.pl → /kb). `tls-check` odpowiada Caddy, czy wydać certyfikat (on-demand TLS, `ask`).
 */
@Controller()
export class PodgladPublicController {
  constructor(private readonly podglad: PodgladService) {}

  @Get('podglad/tls-check')
  async tlsCheck(@Query('domain') domain: string) {
    if (!(await this.podglad.czyWydacCertyfikat(domain))) throw new NotFoundException();
    return { ok: true };
  }

  @All(['podglad-proxy', 'podglad-proxy/*sciezka'])
  @RateLimit({ limit: 600, windowMs: 60 * 1000, scope: 'podglad:proxy' })
  async proxy(@Req() req: Request, @Res() res: Response) {
    const sciezka = req.originalUrl.replace(/^\/podglad-proxy/, '') || '/';
    return this.podglad.proxy(req, res, sciezka.startsWith('/') ? sciezka : `/${sciezka}`);
  }
}

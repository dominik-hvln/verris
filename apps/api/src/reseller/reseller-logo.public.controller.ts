import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ResellerService } from './reseller.service';

/**
 * O-09 — logo resellera dla jego klientów (panel i maile), bez logowania.
 * Tylko rastry sprawdzone po sygnaturze przy zapisie; tu dodatkowo nosniff i CSP
 * bez niczego — plik nie wykona się jako dokument.
 */
@Controller('public/reseller-logo')
export class ResellerLogoPublicController {
  constructor(private readonly reseller: ResellerService) {}

  @Get(':code')
  async logo(@Param('code') code: string, @Res() res: Response) {
    if (!/^rsl_[a-z0-9]{4,32}$/.test(code)) throw new NotFoundException();
    const l = await this.reseller.logoPubliczne(code);
    if (!l) throw new NotFoundException();
    res.setHeader('Content-Type', l.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(l.data);
  }
}

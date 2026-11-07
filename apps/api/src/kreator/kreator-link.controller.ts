import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { KreatorPublikacjaService } from './publikacja.service.js';

const PODSTRONA = /^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60})?)?$/;

/**
 * Publiczny link podglądu wersji próbnej (paczka 121): /kreator/p/<token>/ i /kreator/p/<token>/<podstrona>/.
 * Bez logowania – dostęp daje token HMAC (publikacja-token.ts), ważny 7 dni, unieważniany wycofaniem i usunięciem
 * strony. CSS i JS osadzone w HTML (bez zasobów pod tokenem), linki podstron względne – stąd ukośnik na końcu.
 */
@Controller('kreator/p')
export class KreatorLinkController {
  constructor(private readonly publikacja: KreatorPublikacjaService) {}

  @Get([':token', ':token/*podstrona'])
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator:link' })
  async strona(@Param('token') token: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const sciezka = req.path;
    const prefiks = `/kreator/p/${token}`;
    const i = sciezka.indexOf(prefiks);
    const reszta = i >= 0 ? sciezka.slice(i + prefiks.length) : '';
    const podstrona = reszta.replace(/^\/+|\/+$/g, '');
    if (!reszta.endsWith('/')) {
      // Względne linki strony („o-nas/”, „../”) działają tylko z ukośnikiem na końcu adresu. Przekierowanie względne
      // (sam ostatni segment, tylko [a-z0-9-]) – nie da się nim wyprowadzić na inny adres.
      const ostatni = sciezka.slice(sciezka.lastIndexOf('/') + 1);
      if (/^[a-z0-9-]{1,80}$/.test(ostatni)) {
        res.redirect(301, `${ostatni}/`);
        return;
      }
    }
    const wynik = await this.publikacja.stronaLinku(token, PODSTRONA.test(podstrona) ? podstrona : null);
    for (const [k, v] of Object.entries(wynik.naglowki)) res.setHeader(k, v);
    res.status(wynik.status).send(wynik.html);
  }
}

import { Controller, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { KreatorFormularzService } from './formularz.service.js';

/**
 * Formularz kontaktowy opublikowanych stron z kreatora: POST /kreator/formularz/<token>. Świadomie publiczny –
 * dostęp daje token HMAC strony (formularz-token.ts) wpisany w HTML przy publikacji. Treść: zwykły POST formularza
 * (application/x-www-form-urlencoded – parser urlencoded Nesta jest włączony domyślnie, main.ts nadpisuje tylko
 * limit JSON). Bez CORS (nawigacja przeglądarki, nie fetch). Odpowiedź 303 na stronę z `?formularz=wyslano|blad`.
 * @RateLimit to zewnętrzny bezpiecznik przeciw zalewowi (Redis, 429); właściwy limit 5/10 min per IP i 50/dobę
 * per strona liczy serwis i odpowiada przekierowaniem z komunikatem błędu.
 */
@Controller('kreator/formularz')
export class KreatorFormularzController {
  constructor(private readonly formularz: KreatorFormularzService) {}

  @Post(':token')
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator:formularz' })
  async wyslij(@Param('token') token: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const naglowek = (n: string) => {
      const v = req.headers[n];
      return typeof v === 'string' ? v : undefined;
    };
    const wynik = await this.formularz.wyslij(token, req.body, {
      ip: req.ip ?? req.socket?.remoteAddress ?? 'nieznany',
      origin: naglowek('origin'),
      referer: naglowek('referer'),
    });
    if (wynik.status === 303) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(303, wynik.adres);
      return;
    }
    for (const [k, v] of Object.entries(wynik.naglowki)) res.setHeader(k, v);
    res.status(wynik.status).send(wynik.html);
  }
}

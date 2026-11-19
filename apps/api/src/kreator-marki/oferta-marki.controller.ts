import { Controller, Get, HttpCode } from '@nestjs/common';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { ofertaMarki, type OfertaMarki } from './konfiguracja-marki.js';

/**
 * Kreator marki na verris.pl (paczka 130) – publiczne warunki oferty bez logowania, jak GET /plans
 * i GET /public/oferta/kredyty-startowe (decyzja 1.11.2026: kwoty na stronie z ustawień, nie z kodu).
 * Dopóki moduł nie jest włączony dla wszystkich: `{ dostepny: false }` – strona /kreator-marki zwraca 404.
 */
@Controller('public/oferta')
export class OfertaMarkiController {
  constructor(private readonly konfiguracja: KonfiguracjaMarkiService) {}

  @Get('kreator-marki')
  @HttpCode(200)
  async kreatorMarki(): Promise<OfertaMarki> {
    return ofertaMarki(await this.konfiguracja.konfiguracja());
  }
}

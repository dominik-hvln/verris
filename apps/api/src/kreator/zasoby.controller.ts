import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { opcjeUploaduDoPamieci } from '../common/upload/multer-limity.js';
import { MAKS_BAJTOW_WEJSCIA } from './zasoby-obraz.js';
import { KreatorZasobyService } from './zasoby.service.js';
import { AdresyZasobowDto, GenerujObrazDto, ImportZasobuDto, ListaZasobowDto, SzukajZdjecDto, WgrajZasobDto } from './dto/zasoby.dto.js';
import { KreatorObrazyAiService } from './generowanie/obrazy-ai.service.js';

type Uzytkownik = { userId: string; principalUserId?: string };

/** Zapas na nagłówki części multipart – limit samego pliku sprawdza serwis (MAKS_BAJTOW_WEJSCIA, komunikat po polsku). */
const LIMIT_MULTIPART = MAKS_BAJTOW_WEJSCIA + 64 * 1024;

/** Nagłówki plików zdjęć serwowanych bez logowania (stała treść pod stałym adresem). */
function naglowkiPliku(res: Response, typ: string, cacheSekund: number): void {
  res.setHeader('Content-Type', typ);
  res.setHeader('Cache-Control', `public, max-age=${cacheSekund}, immutable`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // Podgląd w ramce z sandboxem (origin „null”) i panel na innym hoście ładują te obrazy – same-site by je blokował.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

/**
 * Verris Kreator – biblioteka zdjęć konta (paczka 122). Subkonta (reguła /kreator w customer-permissions.guard.ts):
 * lista, adresy i wyszukiwanie – SERVICES_READ; wgranie, import i usunięcie – FILES_MANAGE.
 */
@Controller('kreator')
@UseGuards(JwtAuthGuard)
export class KreatorZasobyController {
  constructor(
    private readonly zasoby: KreatorZasobyService,
    private readonly obrazyAi: KreatorObrazyAiService,
  ) {}

  @Get('zasoby')
  lista(@CurrentUser() u: Uzytkownik, @Query() q: ListaZasobowDto) {
    return this.zasoby.lista(u.userId, q.strona ?? 1);
  }

  /** Adresy plików do podglądu na żywo w panelu (render w Next potrzebuje podpisanych adresów API). */
  @Get('zasoby/adresy')
  adresy(@CurrentUser() u: Uzytkownik, @Query() q: AdresyZasobowDto) {
    return this.zasoby.adresy(u.userId, q.ids.split(','));
  }

  @Post('zasoby')
  @RateLimit({ limit: 60, windowMs: 10 * 60 * 1000, scope: 'kreator:zasob-wgranie', perKonto: true })
  @UseInterceptors(FileInterceptor('plik', opcjeUploaduDoPamieci(LIMIT_MULTIPART)))
  wgraj(@CurrentUser() u: Uzytkownik, @Body() dto: WgrajZasobDto, @UploadedFile() plik: Express.Multer.File | undefined) {
    return this.zasoby.wgraj(u.userId, plik?.buffer, dto);
  }

  /** Paczka 124 – zakładka „Wygeneruj”: czy generowanie działa, ile zdjęć AI zostało w miesiącu, ile wariantów. */
  @Get('zasoby/generuj')
  stanGenerowania(@CurrentUser() u: Uzytkownik) {
    return this.obrazyAi.stan(u.userId);
  }

  /**
   * Paczka 124 – zdjęcie generowane przez AI (synchronicznie, do ok. 2 min: prompt + dostawca obrazów). Uprawnienia
   * subkonta jak wgranie (reguła /kreator: FILES_MANAGE). Limit częstotliwości obok limitu miesięcznego planu.
   */
  @Post('zasoby/generuj')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * 60 * 1000, scope: 'kreator:obraz-ai', perKonto: true })
  generuj(@CurrentUser() u: Uzytkownik, @Body() dto: GenerujObrazDto) {
    return this.obrazyAi.generuj(u.userId, u.principalUserId ?? u.userId, dto);
  }

  @Delete('zasoby/:id')
  usun(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.zasoby.usun(u.userId, id);
  }

  @Get('biblioteka')
  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'kreator:biblioteka', perKonto: true })
  szukaj(@CurrentUser() u: Uzytkownik, @Query() q: SzukajZdjecDto) {
    return this.zasoby.szukaj(u.userId, q);
  }

  @Post('biblioteka/import')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator:import', perKonto: true })
  importuj(@CurrentUser() u: Uzytkownik, @Body() dto: ImportZasobuDto) {
    return this.zasoby.importuj(u.userId, dto);
  }
}

/**
 * Publiczny plik wariantu zdjęcia: /kreator/z/<token>/<szer>.<webp|jpg> – token HMAC id zasobu (zasoby-token.ts).
 * Używa go podgląd edytora (ramka bez ciasteczek), link próbny i miniatury biblioteki w panelu. Opublikowane strony
 * mają własne kopie plików (assets/img) – nie zależą od tego adresu.
 */
@Controller('kreator/z')
export class KreatorZasobPlikController {
  constructor(private readonly zasoby: KreatorZasobyService) {}

  @Get(':token/:plik')
  @RateLimit({ limit: 600, windowMs: 60 * 1000, scope: 'kreator:zasob-plik' })
  async plik(@Param('token') token: string, @Param('plik') plik: string, @Res() res: Response): Promise<void> {
    const { strumien, typ } = await this.zasoby.plik(token, plik);
    naglowkiPliku(res, typ, 31_536_000);
    strumien.on('error', () => res.destroy());
    strumien.pipe(res);
  }
}

/** Miniatura wyniku biblioteki zewnętrznej przez proxy API (przeglądarka klienta nie łączy się z dostawcą). */
@Controller('kreator/biblioteka/m')
export class KreatorMiniaturaController {
  constructor(private readonly zasoby: KreatorZasobyService) {}

  @Get(':token')
  @RateLimit({ limit: 300, windowMs: 60 * 1000, scope: 'kreator:miniatura' })
  async miniatura(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const { dane, typ } = await this.zasoby.miniatura(token);
    naglowkiPliku(res, typ, 86_400);
    res.status(200).end(dane);
  }
}

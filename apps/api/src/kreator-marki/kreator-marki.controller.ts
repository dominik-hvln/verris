import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { opcjeUploaduDoPamieci } from '../common/upload/multer-limity.js';
import { ZAKRESY_MARKI } from './konfiguracja-marki.js';
import { KreatorMarkiService, type KtoMarki } from './kreator-marki.service.js';
import {
  BriefMarkiDto,
  DrobnaZmianaDto,
  KontaktMarkiDto,
  KvAiDto,
  LogoQueryDto,
  NapisQueryDto,
  NowaMarkaDto,
  ProjektMarkiDto,
  UstawieniaKvDto,
  WgrajLogoDto,
  WybierzKierunekDto,
  ZakupMarkiDto,
  ZgodyMarkiDto,
} from './dto/kreator-marki.dto.js';

/** Tożsamość z JWT: `userId` = konto (właściciel), `principalUserId` = człowiek za subkontem albo impersonacją. */
type Uzytkownik = { userId: string; principalUserId?: string };
const kto = (u: Uzytkownik): KtoMarki => ({ userId: u.userId, actorUserId: u.principalUserId ?? u.userId });

/** Multipart: limit z zapasem na największe dopuszczalne ustawienie admina; właściwy limit (konfiguracja) sprawdza serwis. */
const LIMIT_MULTIPART = ZAKRESY_MARKI.maksRozmiarWgraniaMb.max * 1024 * 1024 + 64 * 1024;

/**
 * Nagłówki plików marki: typ, nosniff, brak cache (pliki należą do konta). SVG zawsze z CSP `default-src 'none'`
 * i sandbox (SVG otwarty bezpośrednio w przeglądarce nie uruchomi skryptu ani nie pobierze zasobów; style inline –
 * favicon.svg ma <style> dla trybu ciemnego).
 */
export function naglowkiPlikuMarki(res: Response, typ: string, nazwa: string | null, pobranie: boolean): void {
  res.setHeader('Content-Type', typ);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (nazwa) {
    const ascii = nazwa.replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `${pobranie ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nazwa)}`);
  }
}

/**
 * Kreator marki – API panelu klienta (paczka 131), kontrakt: libs/kreator/src/marka/api-kontrakt.ts. Marki należą do
 * konta (`userId` z tokenu); cudza marka = 404. Subkonta: reguła /kreator-marki w customer-permissions.guard.ts
 * (podgląd – SERVICES_READ, zmiany – FILES_MANAGE, zakupy – SERVICES_MANAGE + BILLING_MANAGE).
 */
@Controller('kreator-marki')
@UseGuards(JwtAuthGuard)
export class KreatorMarkiController {
  constructor(private readonly marki: KreatorMarkiService) {}

  @Get('stan')
  stan(@CurrentUser() u: Uzytkownik) {
    return this.marki.stan(u.userId);
  }

  @Post('marki')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'kreator-marki:nowa', perKonto: true })
  utworz(@CurrentUser() u: Uzytkownik, @Body() body: NowaMarkaDto) {
    return this.marki.utworz(kto(u), body);
  }

  @Get('marki/:id')
  pobierz(@CurrentUser() u: Uzytkownik, @Param('id') id: string) {
    return this.marki.pobierz(u.userId, id);
  }

  @Patch('marki/:id/brief')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  brief(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: BriefMarkiDto) {
    return this.marki.zmienBrief(kto(u), id, body);
  }

  @Post('marki/:id/serie')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'kreator-marki:seria', perKonto: true })
  seria(@CurrentUser() u: Uzytkownik, @Param('id') id: string) {
    return this.marki.seria(kto(u), id);
  }

  @Post('marki/:id/odswiezenie')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'kreator-marki:seria', perKonto: true })
  odswiezenie(@CurrentUser() u: Uzytkownik, @Param('id') id: string) {
    return this.marki.odswiezenie(kto(u), id);
  }

  @Post('marki/:id/wybierz')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  wybierz(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: WybierzKierunekDto) {
    return this.marki.wybierz(kto(u), id, body);
  }

  @Put('marki/:id/projekt')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  projekt(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: ProjektMarkiDto) {
    return this.marki.projekt(kto(u), id, body);
  }

  @Put('marki/:id/kv')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  kv(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: UstawieniaKvDto) {
    return this.marki.kv(kto(u), id, body);
  }

  @Put('marki/:id/kontakt')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  kontakt(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: KontaktMarkiDto) {
    return this.marki.kontakt(kto(u), id, body);
  }

  @Post('marki/:id/ai')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:zmiana', perKonto: true })
  ai(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: DrobnaZmianaDto) {
    return this.marki.drobnaZmiana(kto(u), id, body);
  }

  @Post('marki/:id/kv-ai')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:zmiana', perKonto: true })
  kvAi(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: KvAiDto) {
    return this.marki.kvAi(kto(u), id, body);
  }

  @Post('marki/:id/zgody')
  @HttpCode(200)
  @RateLimit({ limit: 60, windowMs: 60 * 1000, scope: 'kreator-marki:zapis', perKonto: true })
  zgody(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Body() body: ZgodyMarkiDto) {
    return this.marki.zgody(kto(u), id, body);
  }

  @Post('wgraj')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'kreator-marki:wgranie', perKonto: true })
  @UseInterceptors(FileInterceptor('plik', opcjeUploaduDoPamieci(LIMIT_MULTIPART)))
  wgraj(@CurrentUser() u: Uzytkownik, @Body() pola: WgrajLogoDto, @UploadedFile() plik: Express.Multer.File | undefined) {
    return this.marki.wgraj(kto(u), plik?.buffer, { ...(pola ?? {}) });
  }

  /** Krzywe napisu do podglądu na żywo (cache w pamięci serwisu). */
  @Get('napis')
  @RateLimit({ limit: 600, windowMs: 60 * 1000, scope: 'kreator-marki:napis', perKonto: true })
  napis(@CurrentUser() u: Uzytkownik, @Query() q: NapisQueryDto) {
    return this.marki.ksztaltNapisu(u.userId, { ...q });
  }

  @Get('marki/:id/logo.svg')
  @RateLimit({ limit: 300, windowMs: 60 * 1000, scope: 'kreator-marki:podglad', perKonto: true })
  async logo(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Query() q: LogoQueryDto, @Res() res: Response): Promise<void> {
    const svg = await this.marki.logoSvg(u.userId, id, { ...q });
    naglowkiPlikuMarki(res, 'image/svg+xml; charset=utf-8', null, false);
    res.status(200).send(svg);
  }

  @Get('marki/:id/material/:material')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator-marki:podglad', perKonto: true })
  async material(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Param('material') material: string, @Res() res: Response): Promise<void> {
    const m = /^([a-z-]{2,40})\.(svg|png)$/.exec(material);
    if (!m) {
      res.status(404).json({ statusCode: 404, message: 'Nie ma takiego materiału.', code: 'NIE_MA_MATERIALU', kod: 'NIE_MA_MATERIALU' });
      return;
    }
    const { dane, typ } = await this.marki.material(u.userId, id, m[1]!, m[2] as 'svg' | 'png');
    naglowkiPlikuMarki(res, typ === 'image/svg+xml' ? 'image/svg+xml; charset=utf-8' : typ, null, false);
    res.status(200).end(dane);
  }

  @Get('marki/:id/pliki')
  pliki(@CurrentUser() u: Uzytkownik, @Param('id') id: string) {
    return this.marki.pliki(u.userId, id);
  }

  @Get('marki/:id/pliki/:plik')
  @RateLimit({ limit: 120, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:plik', perKonto: true })
  async plik(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Param('plik') plik: string, @Res() res: Response): Promise<void> {
    const w = await this.marki.plik(kto(u), id, plik);
    naglowkiPlikuMarki(res, w.typ, w.nazwa, true);
    res.status(200).end(w.dane);
  }

  @Get('marki/:id/eksport.zip')
  @RateLimit({ limit: 10, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:eksport', perKonto: true })
  async eksport(@CurrentUser() u: Uzytkownik, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const w = await this.marki.eksport(kto(u), id);
    naglowkiPlikuMarki(res, w.typ, w.nazwa, true);
    res.status(200).end(w.dane);
  }

  @Post('marki/:id/stopka-email')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:stopka', perKonto: true })
  stopka(@CurrentUser() u: Uzytkownik, @Param('id') id: string) {
    return this.marki.stopkaEmail(u.userId, id);
  }

  @Delete('marki/:id')
  @HttpCode(204)
  async usun(@CurrentUser() u: Uzytkownik, @Param('id') id: string): Promise<void> {
    await this.marki.usun(kto(u), id);
  }

  @Post('pakiet')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:zakup', perKonto: true })
  pakiet(@CurrentUser() u: Uzytkownik, @Body() body: ZakupMarkiDto) {
    return this.marki.zakup(kto(u), 'PAKIET', body);
  }

  @Post('druga-marka')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * 60 * 1000, scope: 'kreator-marki:zakup', perKonto: true })
  drugaMarka(@CurrentUser() u: Uzytkownik, @Body() body: ZakupMarkiDto) {
    return this.marki.zakup(kto(u), 'DRUGA_MARKA', body);
  }
}

/**
 * Pliki marki bez logowania pod nieodgadywalnym adresem (token HMAC – token-marki.ts): logo do stopki e-mail (programy
 * pocztowe wczytują obrazy z https; `data:` blokują), favicon PNG i obraz OG dla strony z Kreatora stron.
 */
@Controller('kreator-marki/p')
export class KreatorMarkiPlikPublicznyController {
  constructor(private readonly marki: KreatorMarkiService) {}

  @Get(':token/:plik')
  @RateLimit({ limit: 600, windowMs: 60 * 1000, scope: 'kreator-marki:publiczny' })
  async plik(@Param('token') token: string, @Param('plik') plik: string, @Res() res: Response): Promise<void> {
    const dane = await this.marki.plikPubliczny(token, plik);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    // programy pocztowe i strony klienta na innych domenach
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).end(dane);
  }
}

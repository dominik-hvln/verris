import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { KreatorService } from './kreator.service.js';
import { OkresProDto, PodgladQueryDto, UtworzStroneDto, ZapiszModelDto, ZmianaAiDto, ZmienNazweDto } from './dto/kreator.dto.js';

/** Tożsamość z JWT: `userId` = konto (właściciel), `principalUserId` = człowiek za subkontem albo impersonacją. */
type Uzytkownik = { userId: string; principalUserId?: string };

/**
 * Verris Kreator – panel klienta (paczka 119). Strony należą do konta (`userId`); cudza strona = 404.
 * Publikacja (hosting, ZIP, WordPress) – kolejna paczka.
 */
@Controller('kreator')
@UseGuards(JwtAuthGuard)
export class KreatorController {
  constructor(private readonly kreator: KreatorService) {}

  @Get('stan')
  stan(@CurrentUser() u: Uzytkownik) {
    return this.kreator.stan(u.userId);
  }

  /** Paczka 123 – Kreator Pro: rozliczenie miesięczne/roczne od następnego odnowienia (okres = bieżący → bez zmiany). */
  @Post('pro/okres')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'kreator:pro-okres', perKonto: true })
  okresPro(@CurrentUser() u: Uzytkownik, @Body() dto: OkresProDto) {
    return this.kreator.okresPro(u.userId, dto.okres);
  }

  @Get('strony')
  lista(@CurrentUser() u: Uzytkownik) {
    return this.kreator.lista(u.userId);
  }

  @Get('strony/:id')
  pobierz(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.kreator.pobierz(u.userId, id);
  }

  /** Generacja w tle – odpowiedź od razu z `id`, panel odpytuje GET /kreator/strony/:id o status. */
  @Post('strony')
  @HttpCode(202)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'kreator:generacja', perKonto: true })
  utworz(@CurrentUser() u: Uzytkownik, @Body() dto: UtworzStroneDto) {
    return this.kreator.utworz(u.userId, u.principalUserId ?? u.userId, dto);
  }

  /**
   * Paczka 123 – ta sama strona generowana od nowa z briefu zapisanego przy tworzeniu (po błędzie albo „Wygeneruj
   * od nowa” w edytorze). Limit generacji i limit żądań jak przy tworzeniu; generacja w tle, odpowiedź = widok strony.
   */
  @Post('strony/:id/generuj-ponownie')
  @HttpCode(202)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'kreator:generacja', perKonto: true })
  generujPonownie(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.kreator.generujPonownie(u.userId, u.principalUserId ?? u.userId, id);
  }

  @Post('strony/:id/propozycja/:n')
  @HttpCode(200)
  propozycja(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number) {
    return this.kreator.wybierzPropozycje(u.userId, id, n);
  }

  @Put('strony/:id')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator:zapis', perKonto: true })
  zapisz(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ZapiszModelDto) {
    return this.kreator.zapiszRecznie(u.userId, id, dto.model);
  }

  /** Zmiana nazwy strony na liście (panel: zmienNazweStrony) – te same strażniki i limit co zapis (PUT). */
  @Patch('strony/:id')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator:zapis', perKonto: true })
  zmienNazwe(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ZmienNazweDto) {
    return this.kreator.zmienNazwe(u.userId, id, dto.nazwa);
  }

  @Post('strony/:id/ai')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * 60 * 1000, scope: 'kreator:zmiana', perKonto: true })
  zmienAi(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ZmianaAiDto) {
    return this.kreator.zmienAi(u.userId, u.principalUserId ?? u.userId, id, dto);
  }

  @Get('strony/:id/wersje')
  wersje(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.kreator.wersje(u.userId, id);
  }

  @Post('strony/:id/wersje/:numer/przywroc')
  @HttpCode(200)
  przywroc(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Param('numer', ParseIntPipe) numer: number) {
    return this.kreator.przywroc(u.userId, id, numer);
  }

  /** HTML podglądu z CSS/JS inline; CSP sandbox bez allow-same-origin, noindex, bez cache (podglad.ts). */
  @Get('strony/:id/podglad')
  @RateLimit({ limit: 120, windowMs: 60 * 1000, scope: 'kreator:podglad', perKonto: true })
  async podglad(
    @CurrentUser() u: Uzytkownik,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PodgladQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { html, naglowki } = await this.kreator.podglad(u.userId, id, q);
    for (const [k, v] of Object.entries(naglowki)) res.setHeader(k, v);
    res.status(200).send(html);
  }

  @Delete('strony/:id')
  usun(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.kreator.usun(u.userId, id);
  }
}

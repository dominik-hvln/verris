import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { KreatorPublikacjaService } from './publikacja.service.js';
import { PublikujDto } from './dto/publikacja.dto.js';
import { nazwaZip } from './zip-strony.js';

type Uzytkownik = { userId: string; principalUserId?: string };

/**
 * Verris Kreator – publikacja (paczka 121): stan, publikacja (domena albo link podglądu w próbie), wycofanie, ZIP.
 * Subkonta: odczyt SERVICES_READ, publikacja i wycofanie FILES_MANAGE (reguła /kreator w customer-permissions.guard.ts).
 */
@Controller('kreator/strony/:id')
@UseGuards(JwtAuthGuard)
export class KreatorPublikacjaController {
  constructor(private readonly publikacja: KreatorPublikacjaService) {}

  @Get('publikacja')
  stan(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.publikacja.stan(u.userId, id);
  }

  /** Limit liczy udane publikacje (409 „katalog zajęty” i błędy walidacji go nie zjadają), bezpiecznik 30 prób/h. */
  @Post('publikuj')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'kreator:publikacja', perKonto: true, tylkoUdane: true, limitProb: 30 })
  publikuj(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublikujDto) {
    return this.publikacja.publikuj(u.userId, u.principalUserId ?? u.userId, id, dto);
  }

  @Post('wycofaj')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'kreator:wycofanie', perKonto: true })
  wycofaj(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.publikacja.wycofaj(u.userId, u.principalUserId ?? u.userId, id);
  }

  @Get('zip')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'kreator:zip', perKonto: true })
  async zip(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { nazwa, dane } = await this.publikacja.zip(u.userId, id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nazwaZip(nazwa)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(dane);
  }
}

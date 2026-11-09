import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RateLimit } from '../../common/guards/rate-limit.guard.js';
import { KreatorWordpressService } from './kreator-wordpress.service.js';
import { PrzejscieWordpressDto } from './kreator-wordpress.dto.js';

type Uzytkownik = { userId: string; principalUserId?: string };

/**
 * Paczka 124 – przejście strony z kreatora na CMS (dziś WordPress). Subkonta: odczyt SERVICES_READ, instalacja,
 * zamiana i cofnięcie FILES_MANAGE (reguła /kreator w customer-permissions.guard.ts – jak instalator WordPressa
 * /wordpress/install, który też wymaga FILES_MANAGE).
 */
@Controller('kreator/strony/:id/cms')
@UseGuards(JwtAuthGuard)
export class KreatorWordpressController {
  constructor(private readonly wp: KreatorWordpressService) {}

  /** Lista celów (karty w panelu), dostępność i stan przejścia – panel odpytuje to w trakcie zadania. */
  @Get()
  stan(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.wp.stan(u.userId, id);
  }

  /** Limit: instalacja podglądu buduje paczkę i zakłada bazę – kilka prób na godzinę na konto. */
  @Post('wordpress')
  @HttpCode(200)
  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000, scope: 'kreator:cms', perKonto: true, tylkoUdane: true, limitProb: 20 })
  uruchom(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PrzejscieWordpressDto) {
    return this.wp.uruchom(u.userId, u.principalUserId ?? u.userId, id, dto);
  }

  @Post('wordpress/cofnij')
  @HttpCode(200)
  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000, scope: 'kreator:cms-cofnij', perKonto: true })
  cofnij(@CurrentUser() u: Uzytkownik, @Param('id', ParseUUIDPipe) id: string) {
    return this.wp.cofnij(u.userId, u.principalUserId ?? u.userId, id);
  }
}

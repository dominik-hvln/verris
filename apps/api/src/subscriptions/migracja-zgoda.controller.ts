import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { DecyzjaZgodyDto } from './dto/migration.dto.js';
import { MigracjaZaKlientaService } from './migracja-za-klienta.service.js';
import { tylkoKlient } from '../compliance/consents.controller.js';

type Klient = { userId: string; principalUserId?: string; impersonatedBy?: string; customerOwnerId?: string | null };

/**
 * PB-45 — zgoda klienta na migrację przygotowaną przez obsługę (link z maila albo baner w Migracjach).
 * Trasy pod `/services/:id/migrations/…` — podgląd jak przy kreatorze (subkonto z SERVICES_READ też).
 * Decyzję (zgoda albo odrzucenie) podejmuje wyłącznie właściciel konta (`tylkoKlient`): nie operator
 * w sesji „Zaloguj jako klient” — ten sam, który migrację przygotował, wpisałby sobie zgodę klienta — ani
 * subkonto/członek zespołu, bo upoważnienie RODO/DPA zapisuje się jako zgoda właściciela usługi.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class MigracjaZgodaController {
  constructor(private readonly zaKlienta: MigracjaZaKlientaService) {}

  @Get(':id/migrations/bundles/:migrationId/zgoda')
  async szczegoly(
    @CurrentUser() user: Klient,
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
    @Query('token') token?: string,
  ) {
    return this.zaKlienta.szczegoly({ subscriptionId: id, userId: user.userId, migrationId, token: token || undefined });
  }

  @Post(':id/migrations/bundles/:migrationId/zgoda')
  @HttpCode(200)
  // Przyjęcie loguje się do starych serwerów IMAP (E-21) — ten sam limit co kreator.
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'migration:preflight' })
  async przyjmij(
    @CurrentUser() user: Klient,
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
    @Body() body: DecyzjaZgodyDto,
    @Req() req: Request,
  ) {
    tylkoKlient(user);
    return this.zaKlienta.przyjmij({
      subscriptionId: id,
      userId: user.userId,
      actorUserId: user.principalUserId ?? user.userId,
      migrationId,
      token: body.token || undefined,
      ip: req.ip ?? null,
    });
  }

  @Post(':id/migrations/bundles/:migrationId/zgoda/odrzuc')
  @HttpCode(200)
  async odrzuc(
    @CurrentUser() user: Klient,
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
    @Body() body: DecyzjaZgodyDto,
    @Req() req: Request,
  ) {
    tylkoKlient(user);
    return this.zaKlienta.odrzuc({
      subscriptionId: id,
      userId: user.userId,
      actorUserId: user.principalUserId ?? user.userId,
      migrationId,
      token: body.token || undefined,
      ip: req.ip ?? null,
    });
  }
}

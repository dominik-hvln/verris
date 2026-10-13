import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

/** NTF-2 — dzwonek in-app w panelu klienta. */
type Osoba = { userId: string; principalUserId?: string };
/**
 * Audyt 13.10 (subaccount-userId-owner-on-principal-routes): `userId` subkonta i członka zespołu to konto NADRZĘDNE —
 * dzwonek pokazywał im powiadomienia właściciela (saldo, usługi spoza zakresu) i pozwalał oznaczać je jako przeczytane.
 * Powiadomienia czyta i oznacza osoba z sesji (principalUserId); właściciel bez zmian (principal = userId).
 */
const osoba = (u: Osoba) => u.principalUserId ?? u.userId;
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: Osoba, @Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : undefined;
    return this.notifications.listForUser(osoba(user), {
      limit: Number.isFinite(n) ? n : undefined,
    });
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: Osoba) {
    return this.notifications.markAllRead(osoba(user));
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: Osoba, @Param('id') id: string) {
    await this.notifications.markRead(osoba(user), id);
    return { ok: true };
  }
}

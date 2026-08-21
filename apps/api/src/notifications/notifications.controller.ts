import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

/** NTF-2 — dzwonek in-app w panelu klienta. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }, @Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : undefined;
    return this.notifications.listForUser(user.userId, {
      limit: Number.isFinite(n) ? n : undefined,
    });
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: { userId: string }) {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    await this.notifications.markRead(user.userId, id);
    return { ok: true };
  }
}

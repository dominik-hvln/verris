import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EmailCategory, EmailStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { EmailLogService, type OperatorOdczytu } from './email-log.service.js';

/**
 * Dziennik poczty. Cały dziennik (lista z filtrami) — tylko ADMIN. D9 (10.10): maile jednego klienta i podgląd
 * wpisu — także STAFF z CUSTOMERS_VIEW (karta klienta, zakładka Komunikacja); serwis wpuszcza STAFF tylko na
 * konta klientów i zapisuje każdy odczyt w dzienniku.
 */
@Controller('admin/email-log')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN)
export class EmailLogAdminController {
  constructor(private readonly logs: EmailLogService) {}

  @Get()
  list(
    @Query('category') category?: EmailCategory,
    @Query('status') status?: EmailStatus,
    @Query('tag') tag?: string,
    @Query('to') toEmail?: string,
    @Query('userId') userId?: string,
    @Query('campaignId') campaignId?: string,
    @Query('from') from?: string,
    @Query('to_date') to?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.logs.list({
      category,
      status,
      tag,
      toEmail,
      userId,
      campaignId,
      from,
      to,
      q,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW')
  detail(@Param('id') id: string, @CurrentUser() aktor: OperatorOdczytu) {
    return this.logs.detail(id, { userId: aktor.userId, role: aktor.role });
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('CUSTOMERS_VIEW')
  listForUser(@Param('userId') userId: string, @CurrentUser() aktor: OperatorOdczytu, @Query('limit') limit?: string) {
    return this.logs.listForUser(userId, limit ? parseInt(limit, 10) : 50, { userId: aktor.userId, role: aktor.role });
  }
}

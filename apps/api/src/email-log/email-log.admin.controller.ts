import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EmailCategory, EmailStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { EmailLogService } from './email-log.service';

@Controller('admin/email-log')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  detail(@Param('id') id: string) {
    return this.logs.detail(id);
  }

  @Get('user/:userId')
  listForUser(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.logs.listForUser(userId, limit ? parseInt(limit, 10) : 50);
  }
}

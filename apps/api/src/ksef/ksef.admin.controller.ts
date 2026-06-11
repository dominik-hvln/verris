import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { KsefService } from './ksef.service';

/** B-1 — admin: stan integracji KSeF + retry odrzuconych. */
@Controller('admin/ksef')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KsefAdminController {
  constructor(private readonly ksef: KsefService) {}

  @Get('overview')
  overview() {
    return this.ksef.adminOverview();
  }

  @Post('invoices/:id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.ksef.retryInvoice(id, user.userId);
  }
}

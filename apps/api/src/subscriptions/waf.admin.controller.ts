import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { WafService } from './waf.service.js';
import { SetWafModeDto } from './dto/waf.dto.js';

/** B2 — admin: ModSecurity WAF per konto (przegląd per węzeł + zmiana trybu). */
@Controller('admin/waf')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WafAdminController {
  constructor(private readonly waf: WafService) {}

  @Get('servers/:serverId')
  overview(@Param('serverId') serverId: string) {
    return this.waf.overviewForServer(serverId);
  }

  @Post('accounts/:accountId/mode')
  @HttpCode(200)
  setMode(
    @Param('accountId') accountId: string,
    @Body() dto: SetWafModeDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.waf.setModeForAccount(accountId, dto.mode, user.userId);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WafService } from './waf.service';
import { SetWafModeDto } from './dto/waf.dto';

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

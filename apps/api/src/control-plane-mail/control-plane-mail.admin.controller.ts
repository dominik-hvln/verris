import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ControlPlaneMailboxKind, ControlPlaneMailboxStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControlPlaneMailService } from './control-plane-mail.service';
import {
  CreateControlPlaneMailboxDto,
  CreateMailAliasDto,
  UpdateControlPlaneMailboxDto,
} from './dto/control-plane-mail.dto';

@Controller('admin/mailboxes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ControlPlaneMailAdminController {
  constructor(private readonly mail: ControlPlaneMailService) {}

  @Get()
  list(
    @Query('kind') kind?: ControlPlaneMailboxKind,
    @Query('status') status?: ControlPlaneMailboxStatus,
  ) {
    return this.mail.listMailboxes({ kind, status });
  }

  @Get('system-addresses')
  systemAddresses() {
    return this.mail.getSystemAddresses();
  }

  @Post('sync-postfix')
  @HttpCode(200)
  syncPostfix() {
    return this.mail.syncPostfixMaps();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.mail.getMailbox(id);
  }

  @Post()
  create(
    @Body() dto: CreateControlPlaneMailboxDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.mail.createMailbox(dto, actor.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateControlPlaneMailboxDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.mail.updateMailbox(id, dto, actor.userId);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.mail.resetMailboxPassword(id, actor.userId);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(@Param('id') id: string, @CurrentUser() actor: { userId: string }) {
    return this.mail.suspendMailbox(id, actor.userId);
  }

  @Post(':id/aliases')
  addAlias(
    @Param('id') id: string,
    @Body() dto: CreateMailAliasDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.mail.addAlias(id, dto, actor.userId);
  }

  @Delete('aliases/:aliasId')
  @HttpCode(200)
  removeAlias(@Param('aliasId') aliasId: string, @CurrentUser() actor: { userId: string }) {
    return this.mail.deleteAlias(aliasId, actor.userId);
  }
}

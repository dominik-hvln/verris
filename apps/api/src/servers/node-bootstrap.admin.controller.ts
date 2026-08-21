import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@verris/database';
import { NodeBootstrapService } from './node-bootstrap.service';
import { BootstrapTokenService } from './bootstrap-token.service';
import { buildNodeBootstrapOneLiner } from './node-bootstrap.script';

class NodeLicenseKeysDto {
  @IsOptional() @IsString() @MaxLength(200)
  daLicenseKey?: string;

  @IsOptional() @IsString() @MaxLength(200)
  clActivationKey?: string;

  @IsOptional() @IsString() @MaxLength(200)
  lsSerial?: string;
}

/**
 * NODE-2/3 — admin/staff: podgląd postępu bootstrapu + wygenerowanie
 * jednorazowego one-linera (wydaje świeży token bootstrapu).
 * NODES_VIEW = odczyt statusu; wydanie tokenu wymaga NODES_MANAGE (destrukcyjne).
 */
@Controller('admin/nodes/:serverId/bootstrap')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class NodeBootstrapAdminController {
  constructor(
    private readonly bootstrap: NodeBootstrapService,
    private readonly tokens: BootstrapTokenService,
    private readonly config: ConfigService,
  ) {}

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  @Get()
  @StaffPerm('NODES_VIEW')
  status(@Param('serverId') serverId: string) {
    return this.bootstrap.getStatus(serverId);
  }

  @Put('license-keys')
  @StaffPerm('NODES_MANAGE')
  setLicenseKeys(@Param('serverId') serverId: string, @Body() dto: NodeLicenseKeysDto) {
    return this.bootstrap.setLicenseKeys(serverId, {
      daLicenseKey: dto.daLicenseKey,
      clActivationKey: dto.clActivationKey,
      lsSerial: dto.lsSerial,
    });
  }

  @Post('one-liner')
  @StaffPerm('NODES_MANAGE')
  async oneLiner(
    @Param('serverId') serverId: string,
    @CurrentUser() user: { userId: string },
  ): Promise<{ oneLiner: string; expiresAt: string }> {
    const issued = await this.tokens.issue({ serverId, createdById: user.userId });
    return {
      oneLiner: buildNodeBootstrapOneLiner({
        apiBaseUrl: this.apiBaseUrl(),
        bootstrapToken: issued.plaintext,
      }),
      expiresAt: issued.token.expiresAt.toISOString(),
    };
  }
}

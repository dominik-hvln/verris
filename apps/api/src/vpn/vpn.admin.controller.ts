import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VpnService } from './vpn.service';

class CreateVpnPeerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;
}

/** ETAP 8 — zarządzanie peerami WireGuard z panelu admina. */
@Controller('admin/vpn')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class VpnAdminController {
  constructor(private readonly vpn: VpnService) {}

  @Get('overview')
  overview() {
    return this.vpn.overview();
  }

  @Post('peers')
  create(@Body() dto: CreateVpnPeerDto, @CurrentUser() user: { userId: string }) {
    return this.vpn.createPeer({ name: dto.name, ownerEmail: dto.ownerEmail }, user.userId);
  }

  @Post('peers/:id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.vpn.revokePeer(id, user.userId);
  }
}

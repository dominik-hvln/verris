import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutboundAbuseGuard } from './outbound-abuse.guard';

class ReleaseCordonDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

/**
 * CYBER-3 — panel admina: podgląd i zwalnianie cordonów wysyłki (outbound spam).
 * ADMIN i STAFF (obsługa nadużyć) mogą przeglądać; zwolnienie wymaga ADMIN.
 */
@Controller('admin/deliverability/cordons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OutboundCordonAdminController {
  constructor(private readonly outbound: OutboundAbuseGuard) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  async list() {
    const cordons = await this.outbound.listCordoned();
    return { count: cordons.length, cordons };
  }

  @Post('release')
  @Roles(Role.ADMIN)
  async release(
    @Body() dto: ReleaseCordonDto,
    @CurrentUser() actor: { userId: string },
  ) {
    await this.outbound.release(dto.userId, actor.userId);
    return { ok: true, released: dto.userId };
  }
}

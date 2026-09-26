import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { OutboundAbuseGuard } from './outbound-abuse.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
  constructor(
    private readonly outbound: OutboundAbuseGuard,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  async list() {
    const cordons = await this.outbound.listCordoned();
    // N-14 — operator widzi, kogo dotyczy blokada, nie sam identyfikator.
    const users = await this.prisma.user.findMany({
      where: { id: { in: cordons.map((c) => c.userId) } },
      select: { id: true, email: true, firstName: true, lastName: true, companyName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      count: cordons.length,
      cordons: cordons.map((c) => {
        const u = byId.get(c.userId);
        return {
          ...c,
          email: u?.email ?? null,
          name: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.companyName || null : null,
        };
      }),
    };
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

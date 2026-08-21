import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

class SecurityAlertDto {
  @IsString()
  @MaxLength(64)
  kind!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  distinctDst?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sample?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  processes?: string;
}

/**
 * Odbiór alertów bezpieczeństwa z węzłów (np. wychodzący skan portów wykryty
 * przez `security-outbound-scan-detect.sh`). Ten sam auth co telemetria.
 * Zapisuje na węźle + audyt — widoczne w panelu admina (alerty floty).
 */
@Controller('agent/security')
@UseGuards(ServerIdentityGuard)
export class NodeSecurityAgentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('alert')
  @HttpCode(200)
  async alert(@Req() req: Request & { serverId?: string }, @Body() dto: SecurityAlertDto) {
    const serverId = req.serverId!;
    const info = [
      dto.distinctDst != null ? `dst=${dto.distinctDst}` : null,
      dto.processes ? `proc=${dto.processes}` : null,
      dto.sample ? `sample=${dto.sample.slice(0, 300)}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        lastSecurityAlertAt: new Date(),
        lastSecurityAlertKind: dto.kind.slice(0, 64),
        lastSecurityAlertInfo: info.slice(0, 2000),
      },
    });

    await this.audit.record({
      action: 'NODE_SECURITY_ALERT',
      details: { serverId, kind: dto.kind, distinctDst: dto.distinctDst ?? null, info },
    });

    return { received: true };
  }
}

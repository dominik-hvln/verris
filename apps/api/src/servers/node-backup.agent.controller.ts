import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

class OffsiteBackupReportDto {
  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  accounts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  info?: string;
}

/**
 * B-1 LIVE — receives off-node backup run reports from `node-offsite-backup.sh`.
 * Same node identity auth as telemetry/security. Records the last run on the
 * Server so the panel/health can flag stale or failing offsite backups
 * (a node loss must never mean customer-data loss).
 */
@Controller('agent/backup')
@UseGuards(ServerIdentityGuard)
export class NodeBackupAgentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('offsite-report')
  @HttpCode(200)
  async offsiteReport(
    @Req() req: Request & { serverId?: string },
    @Body() dto: OffsiteBackupReportDto,
  ) {
    const serverId = req.serverId!;
    const info = [
      dto.accounts != null ? `accounts=${dto.accounts}` : null,
      dto.bytes != null ? `bytes=${dto.bytes}` : null,
      dto.durationSec != null ? `dur=${dto.durationSec}s` : null,
      dto.info ? dto.info.slice(0, 1500) : null,
    ]
      .filter(Boolean)
      .join(' ');

    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        lastOffsiteBackupAt: new Date(),
        lastOffsiteBackupOk: dto.ok,
        lastOffsiteBackupInfo: info.slice(0, 2000),
      },
    });

    await this.audit.record({
      action: dto.ok ? 'NODE_OFFSITE_BACKUP_OK' : 'NODE_OFFSITE_BACKUP_FAILED',
      details: { serverId, accounts: dto.accounts ?? null, bytes: dto.bytes ?? null, info },
    });

    return { received: true };
  }
}

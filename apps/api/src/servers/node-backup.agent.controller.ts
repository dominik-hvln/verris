import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ServerIdentityGuard } from './guards/server-identity.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { zapiszKopieKont } from './kopie-kont.js';

/** F3.3 — wynik kopii jednego konta w przebiegu (node-offsite-backup.sh): login DA, czy archiwum trafiło poza serwer, rozmiar. */
class KontoKopiiDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9]{0,15}$/)
  u!: string;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  b?: number;
}

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

  /** F3.3 — wynik per konto; brak pola = stary skrypt węzła (stan kont bez zmian). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => KontoKopiiDto)
  konta?: KontoKopiiDto[];
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

    const kiedy = new Date();
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        lastOffsiteBackupAt: kiedy,
        lastOffsiteBackupOk: dto.ok,
        lastOffsiteBackupInfo: info.slice(0, 2000),
      },
    });

    const kontZapisanych = dto.konta ? await zapiszKopieKont(this.prisma, serverId, dto.konta, kiedy) : null;
    const nieudane = dto.konta?.filter((k) => !k.ok).map((k) => k.u).slice(0, 50) ?? null;

    await this.audit.record({
      action: dto.ok ? 'NODE_OFFSITE_BACKUP_OK' : 'NODE_OFFSITE_BACKUP_FAILED',
      details: { serverId, accounts: dto.accounts ?? null, bytes: dto.bytes ?? null, info, kontZapisanych, nieudane },
    });

    return { received: true };
  }
}

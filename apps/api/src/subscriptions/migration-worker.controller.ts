import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { ServerIdentityGuard } from '../servers/guards/server-identity.guard';
import { MigrationOrchestratorService } from './migration-orchestrator.service';

class CompleteMigrationWorkerJobDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bytesTransferred!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  filesTransferred!: number;

  @IsOptional()
  @IsString()
  @MaxLength(262144)
  log?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  databasesMigrated?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mailboxesMigrated?: number;

  /** Raport spójności (źródło vs cel) — dowolny płaski obiekt JSON. */
  @IsOptional()
  @IsObject()
  integrity?: Record<string, unknown>;
}

class FailMigrationWorkerJobDto {
  @IsString()
  @MaxLength(5000)
  error!: string;

  @IsOptional()
  @IsString()
  @MaxLength(262144)
  log?: string;

  @IsOptional()
  @IsBoolean()
  retryable?: boolean;
}

class ProgressMigrationWorkerJobDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bytesTransferred?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  filesTransferred?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * R-MIG-2 — compute-node worker protocol.
 *
 * Node agents authenticate with the same post-bootstrap identity as telemetry.
 * Control-plane only queues and audits; file transfer happens on the node that
 * hosts the target account, so large SFTP/rsync traffic never crosses API pods.
 */
@Controller('node/migration-worker')
@UseGuards(ServerIdentityGuard)
export class MigrationWorkerController {
  constructor(private readonly migrations: MigrationOrchestratorService) {}

  @Get('lease')
  async lease(@Req() req: Request & { serverId?: string }) {
    return this.migrations.leaseFileWorkerJobForNode(req.serverId!);
  }

  @Post(':jobId/complete')
  @HttpCode(200)
  async complete(
    @Req() req: Request & { serverId?: string },
    @Param('jobId') jobId: string,
    @Body() dto: CompleteMigrationWorkerJobDto,
  ) {
    return this.migrations.completeWorkerJobFromNode({
      serverId: req.serverId!,
      jobId,
      bytesTransferred: BigInt(dto.bytesTransferred),
      filesTransferred: dto.filesTransferred,
      databasesMigrated: dto.databasesMigrated ?? 0,
      mailboxesMigrated: dto.mailboxesMigrated ?? 0,
      log: dto.log ?? null,
      integrity: dto.integrity ?? null,
    });
  }

  @Post(':jobId/fail')
  @HttpCode(200)
  async fail(
    @Req() req: Request & { serverId?: string },
    @Param('jobId') jobId: string,
    @Body() dto: FailMigrationWorkerJobDto,
  ) {
    return this.migrations.failWorkerJobFromNode({
      serverId: req.serverId!,
      jobId,
      error: dto.error,
      log: dto.log ?? null,
      retryable: dto.retryable === true,
    });
  }

  /** Heartbeat postępu długich transferów (rsync/imapsync) — zasila watchdog i widok klienta. */
  @Post(':jobId/progress')
  @HttpCode(200)
  async progress(
    @Req() req: Request & { serverId?: string },
    @Param('jobId') jobId: string,
    @Body() dto: ProgressMigrationWorkerJobDto,
  ) {
    return this.migrations.progressWorkerJobFromNode({
      serverId: req.serverId!,
      jobId,
      bytesTransferred: dto.bytesTransferred !== undefined ? BigInt(dto.bytesTransferred) : undefined,
      filesTransferred: dto.filesTransferred,
      note: dto.note ?? null,
    });
  }
}

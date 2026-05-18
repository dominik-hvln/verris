import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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
}

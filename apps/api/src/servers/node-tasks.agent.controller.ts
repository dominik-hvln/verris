import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { NodeTasksService } from './node-tasks.service';
import { loadHostingProfileScript } from './hosting-profile.script';
import { IsOptional, IsString, MaxLength } from 'class-validator';

class CompleteNodeTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(120_000)
  outputLog?: string;
}

class FailNodeTaskDto {
  @IsString()
  @MaxLength(4000)
  error!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120_000)
  outputLog?: string;
}

/**
 * Pull-based node task protocol — same auth as telemetry (`X-Server-Id` + `X-Server-Token`).
 * The on-node `verris-tasks` agent polls `lease`, executes locally, then reports complete/fail.
 */
@Controller('agent/tasks')
@UseGuards(ServerIdentityGuard)
export class NodeTasksAgentController {
  constructor(private readonly tasks: NodeTasksService) {}

  @Get('lease')
  async lease(@Req() req: Request & { serverId?: string }) {
    return this.tasks.leaseTaskForNode(req.serverId!);
  }

  @Get('hosting-profile/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  hostingProfileScript() {
    return loadHostingProfileScript();
  }

  @Post(':taskId/complete')
  @HttpCode(200)
  complete(
    @Req() req: Request & { serverId?: string },
    @Param('taskId') taskId: string,
    @Body() dto: CompleteNodeTaskDto,
  ) {
    return this.tasks.completeTaskFromNode({
      serverId: req.serverId!,
      taskId,
      outputLog: dto.outputLog,
    });
  }

  @Post(':taskId/fail')
  @HttpCode(200)
  fail(
    @Req() req: Request & { serverId?: string },
    @Param('taskId') taskId: string,
    @Body() dto: FailNodeTaskDto,
  ) {
    return this.tasks.failTaskFromNode({
      serverId: req.serverId!,
      taskId,
      error: dto.error,
      outputLog: dto.outputLog,
    });
  }
}

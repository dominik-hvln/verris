import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServerIdentityGuard } from './guards/server-identity.guard';
import { NodeTasksService } from './node-tasks.service';
import {
  buildDefaultHostingPageBundle,
  loadDefaultHostingPageInstallScript,
} from './default-hosting-page.assets';
import { loadHostingProfileScript } from './hosting-profile.script';
import { loadLveAgentScript } from './lve-agent.script';
import { loadWpInstallScript } from './wp-install.script';
import { loadWafApplyScript } from './waf-apply.script';
import { loadStagingSyncScript } from './staging-sync.script';
import { loadPhpApplyScript } from './php-apply.script';
import { loadAppInstallScript } from './app-install.script';
import { loadDbUpgradeScript } from './db-upgrade.script';
import { loadOffsiteRestoreScript } from './offsite-restore.script';
import { loadNodeUpdateScript } from './node-update.script';
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

class ProgressNodeTaskDto {
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

  @Get('deploy-ssh-pubkey')
  deploySshPubkey() {
    const publicKey = (process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY ?? '').trim() || null;
    return { publicKey };
  }

  @Get('lease')
  async lease(@Req() req: Request & { serverId?: string }) {
    return this.tasks.leaseTaskForNode(req.serverId!);
  }

  @Get('hosting-profile/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  hostingProfileScript() {
    return loadHostingProfileScript();
  }

  /** A4 — WordPress installer script (run with WP_* env from the task payload). */
  @Get('wp-install/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  wpInstallScript() {
    return loadWpInstallScript();
  }

  /** B2 — ModSecurity per-account apply script (run with WAF_* env). */
  @Get('waf-apply/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  wafApplyScript() {
    return loadWafApplyScript();
  }

  /** P-6 — per-account PHP version apply script (run with PHP_* env). */
  @Get('php-apply/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  phpApplyScript() {
    return loadPhpApplyScript();
  }

  /** P-3 — 1-click app installer script (run with APP_* env). */
  @Get('app-install/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  appInstallScript() {
    return loadAppInstallScript();
  }

  /** S-1 — off-site account restore script (run with OFR_* env). */
  @Get('offsite-restore/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  offsiteRestoreScript() {
    return loadOffsiteRestoreScript();
  }

  /** VER-UPG — MariaDB engine upgrade script (run with DB_TARGET_VERSION env). */
  @Get('db-upgrade/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  dbUpgradeScript() {
    return loadDbUpgradeScript();
  }

  /** NODE-6 — fleet update script (CustomBuild + yum → latest-stable). */
  @Get('node-update/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  nodeUpdateScript() {
    return loadNodeUpdateScript();
  }

  /** B5 — staging clone/publish script (run with STG_* env). */
  @Get('staging-sync/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  stagingSyncScript() {
    return loadStagingSyncScript();
  }

  @Get('hosting-profile/default-page/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  defaultHostingPageInstallScript() {
    return loadDefaultHostingPageInstallScript();
  }

  @Get('hosting-profile/default-page/bundle')
  async defaultHostingPageBundle() {
    const buffer = await buildDefaultHostingPageBundle();
    return new StreamableFile(buffer, {
      type: 'application/gzip',
      disposition: 'attachment; filename="verris-default-page.tar.gz"',
    });
  }

  /** Desired CloudLinux LVE state for the calling node (plans + accounts). */
  @Get('lve/desired')
  lveDesired(@Req() req: Request & { serverId?: string }) {
    return this.tasks.getDesiredLveForServer(req.serverId!);
  }

  /** Canonical on-node LVE agent script (reconcile + telemetry). */
  @Get('lve/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  lveAgentScript() {
    return loadLveAgentScript();
  }

  @Post(':taskId/progress')
  @HttpCode(200)
  progress(
    @Req() req: Request & { serverId?: string },
    @Param('taskId') taskId: string,
    @Body() dto: ProgressNodeTaskDto,
  ) {
    return this.tasks.progressTaskFromNode({
      serverId: req.serverId!,
      taskId,
      outputLog: dto.outputLog,
    });
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

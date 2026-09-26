import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServerIdentityGuard } from './guards/server-identity.guard.js';
import { NodeTasksService } from './node-tasks.service.js';
import {
  buildDefaultHostingPageBundle,
  loadDefaultHostingPageInstallScript,
} from './default-hosting-page.assets.js';
import { loadHostingProfileScript } from './hosting-profile.script.js';
import { loadLveAgentScript } from './lve-agent.script.js';
import { loadWpInstallScript } from './wp-install.script.js';
import { loadWafApplyScript } from './waf-apply.script.js';
import { loadStagingSyncScript } from './staging-sync.script.js';
import { loadPhpApplyScript } from './php-apply.script.js';
import { loadAppInstallScript } from './app-install.script.js';
import { loadDbUpgradeScript } from './db-upgrade.script.js';
import { loadOffsiteRestoreScript } from './offsite-restore.script.js';
import { loadDbTransferScript } from './db-transfer.script.js';
import { loadFileRestoreScript } from './file-restore.script.js';
import { loadSshAccessScript } from './ssh-access.script.js';
import { loadWpUpdateScript } from './wp-update.script.js';
import { loadDiskUsageScript } from './disk-usage.script.js';
import { loadMalwareScanScript } from './malware-scan.script.js';
import { loadRedisScript } from './redis.script.js';
import { loadMailLogScript } from './mail-log.script.js';
import { loadGitDeployScript } from './git-deploy.script.js';
import { loadSiteCloneScript } from './site-clone.script.js';
import { loadHtaccessScript } from './htaccess.script.js';
import { loadAppSelectorScript } from './app-selector.script.js';
import { loadSlowSqlScript } from './slow-sql.script.js';
import { loadPgsqlScript } from './pgsql.script.js';
import { loadImageOptimizeScript } from './image-optimize.script.js';
import { loadMemcachedScript } from './memcached.script.js';
import { loadSiteStatsScript } from './site-stats.script.js';
import { loadPhpInfoScript } from './php-info.script.js';
import { loadFileSearchScript } from './file-search.script.js';
import { loadNodeUpdateScript } from './node-update.script.js';
import { buildOnboardBundle, loadOnboardLiveScript } from './onboard-live.script.js';
import { BackupOffsiteService } from './backup-offsite.service.js';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { stosJakoEnv } from './stos-wezla.js';
import { StosWezlaService } from './stos-wezla.service.js';
import { linijkaAuthorizedKeys, PodpisOdpowiedziInterceptor } from './podpis-skryptow.js';

class OnboardReportDto {
  @IsBoolean()
  ok!: boolean;

  @IsInt() @Min(0) @Max(10000)
  fail!: number;

  @IsInt() @Min(0) @Max(10000)
  warn!: number;

  @IsOptional() @IsString() @MaxLength(20000)
  podsumowanie?: string;
}

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
@UseInterceptors(PodpisOdpowiedziInterceptor)
export class NodeTasksAgentController {
  constructor(
    private readonly tasks: NodeTasksService,
    private readonly backup: BackupOffsiteService,
    private readonly stos: StosWezlaService,
  ) {}

  @Get('deploy-ssh-pubkey')
  deploySshPubkey() {
    const publicKey = (process.env.VERRIS_NODE_DEPLOY_SSH_PUBKEY ?? '').trim() || null;
    // PB-36 — węzeł instaluje gotowy wpis z from="<control-plane>" (bez niego klucz nie trafia na węzeł)
    return { publicKey, authorizedKeysLine: linijkaAuthorizedKeys(publicKey) };
  }

  /** PB-30 — manifest stosu floty; agent zadań zapisuje go co minutę do /etc/verris-stack.env. */
  @Get('stack-env')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async stackEnv() {
    return stosJakoEnv(await this.stos.pobierz());
  }

  /** PB-29 — wynik node-live-readiness.sh; dopiero zielony raport wpuszcza węzeł do przydziału kont. */
  @Post('onboard-report')
  @HttpCode(204)
  async onboardReport(@Req() req: Request & { serverId?: string }, @Body() dto: OnboardReportDto) {
    await this.tasks.recordOnboardReport(req.serverId!, dto);
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

  /** D-12 — eksport/import bazy klienta (run with DBT_* env). */
  @Get('db-transfer/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  dbTransferScript() {
    return loadDbTransferScript();
  }

  /** H-10/H-11 — podgląd archiwum i odtworzenie pliku (run with FR_* env). */
  @Get('file-restore/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  fileRestoreScript() {
    return loadFileRestoreScript();
  }

  /** C-21/C-22 — SSH w klatce CageFS i klucze (run with SSH_* env). */
  @Get('ssh-access/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  sshAccessScript() {
    return loadSshAccessScript();
  }

  /** I-04/I-05 — aktualizacje WordPressa domeny (run with WPU_* env). */
  @Get('wp-update/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  wpUpdateScript() {
    return loadWpUpdateScript();
  }

  /** C-15/K-03 — zajętość katalogów konta (run with DU_* env). */
  @Get('disk-usage/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  diskUsageScript() {
    return loadDiskUsageScript();
  }

  /** G-11 — skan ImunifyAV konta (run with MS_* env). */
  @Get('malware-scan/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  malwareScanScript() {
    return loadMalwareScanScript();
  }

  /** D-15/J-03 — Redis konta (run with RD_* env). */
  @Get('redis/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  redisScript() {
    return loadRedisScript();
  }

  /** E-19 — dziennik dostarczania poczty konta (run with ML_* env). */
  @Get('mail-log/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  mailLogScript() {
    return loadMailLogScript();
  }

  /** C-25/C-26 — repozytorium Git strony (run with GD_* env). */
  @Get('git-deploy/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  gitDeployScript() {
    return loadGitDeployScript();
  }

  /** I-13 — kopia strony na inną domenę konta (run with SC_* env). */
  @Get('site-clone/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  siteCloneScript() {
    return loadSiteCloneScript();
  }

  /** B-17/B-18/G-07 — blok ustawień Verris w .htaccess strony (run with HT_* env). */
  @Get('htaccess/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  htaccessScript() {
    return loadHtaccessScript();
  }

  /** B-08/B-09 — aplikacje Node.js / Python przez CloudLinux Selector (run with AS_* env). */
  @Get('app-selector/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  appSelectorScript() {
    return loadAppSelectorScript();
  }

  /** J-06 — optymalizacja obrazów strony (run with IO_* env). */
  @Get('image-optimize/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  imageOptimizeScript() {
    return loadImageOptimizeScript();
  }

  /** D-14 — bazy PostgreSQL konta (run with PG_* env). */
  @Get('pgsql/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  pgsqlScript() {
    return loadPgsqlScript();
  }

  /** K-14 — wolne zapytania SQL baz konta (run with SQ_* env). */
  @Get('slow-sql/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  slowSqlScript() {
    return loadSlowSqlScript();
  }

  /** D-16 — Memcached konta (run with MC_* env). */
  @Get('memcached/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  memcachedScript() {
    return loadMemcachedScript();
  }

  /** PB-19 — technologia, ruch i TTFB strony (run with SS_* env). */
  @Get('site-stats/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  siteStatsScript() {
    return loadSiteStatsScript();
  }

  /** B-06 — konfiguracja PHP strony przez serwer WWW (run with PI_* env). */
  @Get('php-info/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  phpInfoScript() {
    return loadPhpInfoScript();
  }

  /** C-14 — wyszukiwanie plików w katalogu strony (run with FS_* env). */
  @Get('file-search/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  fileSearchScript() {
    return loadFileSearchScript();
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

  /** PB-31 — konfiguracja kopii off-site floty dla węzła (sekrety; odczyt w audycie). 404 = nieskonfigurowane. */
  @Get('backup-config')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async backupConfig(@Req() req: Request & { serverId?: string }) {
    const tresc = await this.backup.dlaWezla(req.serverId!);
    if (!tresc) throw new NotFoundException('Kopie off-site nie są skonfigurowane w panelu (kreator węzła → krok 4).');
    return tresc;
  }

  /** PB-31 — Onboard LIVE z panelu: skrypt-opakowanie i pakiet w układzie repo. */
  @Get('onboard-live/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  onboardLiveScript() {
    return loadOnboardLiveScript();
  }

  @Get('onboard-live/bundle')
  @Header('Content-Type', 'application/gzip')
  @Header('Content-Disposition', 'attachment; filename="verris-onboard.tar.gz"')
  onboardLiveBundle() {
    return buildOnboardBundle();
  }

  @Get('hosting-profile/default-page/script')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  defaultHostingPageInstallScript() {
    return loadDefaultHostingPageInstallScript();
  }

  @Get('hosting-profile/default-page/bundle')
  @Header('Content-Type', 'application/gzip')
  @Header('Content-Disposition', 'attachment; filename="verris-default-page.tar.gz"')
  defaultHostingPageBundle() {
    return buildDefaultHostingPageBundle();
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

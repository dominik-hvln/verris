import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HostingSslLetsencryptDto, HostingSslPasteDto } from './dto/hosting-ssl.dto';
import { CreateMigrationBundleDto, RequestExternalMigrationDto } from './dto/migration.dto';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { ServiceHealthService } from './service-health.service';
import { HostingDnsPointingService } from './hosting-dns-pointing.service';
import { HostingRestoreService } from './hosting-restore.service';
import { HostingRestoreDto } from './dto/hosting-restore.dto';
import { WordpressService } from './wordpress.service';
import { InstallWordpressDto } from './dto/wordpress.dto';
import { WafService } from './waf.service';
import { SetWafModeDto } from './dto/waf.dto';
import { SiteMonitorService } from './site-monitor.service';
import { StagingService } from './staging.service';
import { SetMonitoringDto } from './dto/site-monitor.dto';
import { EcoReportService } from '../eco/eco-report.service';
import { DeliverabilityService } from '../deliverability/deliverability.service';
import { PhpService } from './php.service';
import { AppInstallService } from './app-install.service';

/**
 * Customer-facing "services" view — denormalized projection over Subscription
 * + Account + Plan, designed to back the existing `/services` UI page.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class UserServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly migrations: MigrationOrchestratorService,
    private readonly serviceHealth: ServiceHealthService,
    private readonly dnsPointing: HostingDnsPointingService,
    private readonly hostingRestore: HostingRestoreService,
    private readonly wordpress: WordpressService,
    private readonly waf: WafService,
    private readonly siteMonitor: SiteMonitorService,
    private readonly staging: StagingService,
    private readonly ecoReport: EcoReportService,
    private readonly deliverability: DeliverabilityService,
    private readonly php: PhpService,
    private readonly appInstall: AppInstallService,
  ) {}

  // P-3 — marketplace 1-click (Nextcloud/PrestaShop).
  @Get(':id/apps')
  appsStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.appInstall.statusForSubscription(id, user.userId);
  }

  @Post(':id/apps/install')
  @HttpCode(200)
  appsInstall(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { app: string; adminUser: string; adminEmail: string; adminPassword?: string },
  ) {
    return this.appInstall.install(id, user.userId, body);
  }

  // P-2 — diagnostyka dostarczalności poczty (SPF/DKIM/DMARC + RBL).
  @Get(':id/deliverability')
  deliverabilityFor(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.deliverability.forSubscription(id, user.userId);
  }

  // P-6 — wersja PHP konta.
  @Get(':id/hosting-php')
  hostingPhp(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.php.statusForSubscription(id, user.userId);
  }

  @Post(':id/hosting-php')
  @HttpCode(200)
  setHostingPhp(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { version: string },
  ) {
    return this.php.setVersionForSubscription(id, user.userId, body.version);
  }

  // C5 — raport energetyczny z realnych metryk LVE (szacunki, jawna metodologia)
  @Get(':id/eco-report')
  ecoReportFor(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ecoReport.reportForSubscription(id, user.userId);
  }

  // B3 — monitoring strony (jeden przełącznik, zero konfiguracji)
  @Get(':id/monitoring')
  monitoringStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.siteMonitor.statusForSubscription(id, user.userId);
  }

  @Post(':id/monitoring')
  setMonitoring(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SetMonitoringDto,
  ) {
    return this.siteMonitor.setEnabled(id, user.userId, dto.enabled);
  }

  // B5 — staging 1-click (klon LIVE → staging.<domena>, publikacja z powrotem)
  @Get(':id/staging-env')
  stagingStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.staging.statusForSubscription(id, user.userId);
  }

  @Post(':id/staging-env/create')
  stagingCreate(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.staging.createOrRefresh(id, user.userId);
  }

  @Post(':id/staging-env/push')
  stagingPush(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.staging.pushToLive(id, user.userId);
  }

  @Delete(':id/staging-env')
  stagingDelete(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.staging.remove(id, user.userId);
  }

  // B2 — ModSecurity WAF (klient zarządza trybem dla własnej usługi)
  @Get(':id/waf')
  wafStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.waf.statusForSubscription(id, user.userId);
  }

  @Post(':id/waf/mode')
  setWafMode(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SetWafModeDto,
  ) {
    return this.waf.setModeForSubscription(id, user.userId, dto.mode);
  }

  // A4 — WordPress 1-click installer
  @Get(':id/wordpress/status')
  wordpressStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.wordpress.statusForSubscription(id, user.userId);
  }

  @Post(':id/wordpress/install')
  installWordpress(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: InstallWordpressDto,
  ) {
    return this.wordpress.install(id, user.userId, {
      siteTitle: dto.siteTitle,
      adminUser: dto.adminUser,
      adminEmail: dto.adminEmail,
      locale: dto.locale,
    });
  }

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Query('includeCanceled') includeCanceled?: string,
  ) {
    const showCanceled = includeCanceled === '1' || includeCanceled === 'true';
    const subs = await this.prisma.subscription.findMany({
      where: {
        userId: user.userId,
        ...(showCanceled
          ? {}
          : {
              status: {
                notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED],
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        account: { include: { server: { select: { id: true, name: true, region: true } } } },
        healthSnapshots: { orderBy: { computedAt: 'desc' }, take: 1 },
      },
    });

    return subs.map((s) => ({
      id: s.id,
      status: s.status,
      paymentSource: s.paymentSource,
      planSlug: s.plan.slug,
      planName: s.plan.name,
      interval: s.interval,
      priceAmount: s.priceAmount.toString(),
      currency: s.currency,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      ecoModeEnabled: s.ecoModeEnabled,
      autoscalingEnabled: s.autoscalingEnabled,
      isTrial: s.isTrial,
      trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
      productKind: s.plan.productKind,
      provisioning: s.provisioningStage
        ? {
            stage: s.provisioningStage as
              | 'queued'
              | 'running'
              | 'retrying'
              | 'failed'
              | 'completed',
            attempts: s.provisioningAttempts,
            startedAt: s.provisioningStartedAt?.toISOString() ?? null,
            completedAt: s.provisioningCompletedAt?.toISOString() ?? null,
            // Sprint 5 / R-11+B-7 — never expose raw DA error to klient,
            // tylko top-level kategorię. Pełen tekst jest w audit / admin queue.
            lastError: s.provisioningLastError
              ? humanizeProvisioningError(s.provisioningLastError)
              : null,
          }
        : null,
      health: buildHealthSummary(s),
      recommendations: buildServiceRecommendations(s),
      account: s.account
        ? {
            id: s.account.id,
            domain: s.account.domain,
            daUsername: s.account.daUsername,
            status: s.account.status,
            cpuLimit: s.account.cpuLimit,
            ramLimitMb: s.account.ramLimitMb,
            diskLimitMb: s.account.diskLimitMb,
            scaledCpu: s.account.scaledCpu,
            scaledRamMb: s.account.scaledRamMb,
            scaledDiskMb: s.account.scaledDiskMb,
            server: s.account.server
              ? {
                  id: s.account.server.id,
                  name: s.account.server.name,
                  region: s.account.server.region,
                }
              : null,
          }
        : null,
    }));
  }

  /** Lista domen DirectAdmin dla konta przypisanego do subskrypcji — panel klienta B‑14. */
  @Get(':id/hosting-domains')
  async hostingDomains(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingDomainsForSubscription(id, user.userId);
  }

  @Get(':id/hosting-databases')
  async hostingDatabases(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingMysqlForSubscription(id, user.userId);
  }

  @Get(':id/hosting-da-links')
  async hostingDaLinks(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getHostingDaLinksForSubscription(id, user.userId);
  }

  @Get(':id/connection-info')
  async connectionInfo(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getConnectionInfo(id, user.userId);
  }

  @Get(':id/hosting-domain-pointing')
  async hostingDomainPointing(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.dnsPointing.verifyForSubscription(id, user.userId);
  }

  @Post(':id/hosting-domain-pointing/verify')
  async verifyHostingDomainPointing(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.dnsPointing.verifyForSubscription(id, user.userId);
  }

  @Get(':id/hosting-dns')
  async hostingDns(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('domain') domain?: string,
  ) {
    return this.directAdmin.listHostingDnsRecords(id, user.userId, domain);
  }

  @Post(':id/hosting-dns')
  async createHostingDns(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body()
    body: { domain: string; name: string; type: string; value: string; ttl?: number },
  ) {
    return this.directAdmin.createHostingDnsRecord(id, user.userId, body);
  }

  @Delete(':id/hosting-dns')
  async deleteHostingDns(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { domain: string; name: string; type: string; value: string },
  ) {
    return this.directAdmin.deleteHostingDnsRecord(id, user.userId, body);
  }

  @Get(':id/hosting-ftp')
  async hostingFtp(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingFtpAccounts(id, user.userId);
  }

  @Post(':id/hosting-ftp')
  async createHostingFtp(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { username: string; password: string; directory?: string },
  ) {
    return this.directAdmin.createHostingFtpAccount(id, user.userId, body);
  }

  @Delete(':id/hosting-ftp/:username')
  async deleteHostingFtp(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('username') username: string,
  ) {
    return this.directAdmin.deleteHostingFtpAccount(id, user.userId, username);
  }

  @Get(':id/hosting-email')
  async hostingEmail(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingEmailAccounts(id, user.userId);
  }

  @Post(':id/hosting-email')
  async createHostingEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { email: string; password: string; quotaMb?: number },
  ) {
    return this.directAdmin.createHostingEmailAccount(id, user.userId, body);
  }

  @Delete(':id/hosting-email/:email')
  async deleteHostingEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('email') email: string,
  ) {
    return this.directAdmin.deleteHostingEmailAccount(id, user.userId, decodeURIComponent(email));
  }

  @Get(':id/hosting-cron')
  async hostingCron(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingCronJobs(id, user.userId);
  }

  @Post(':id/hosting-cron')
  async createHostingCron(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body()
    body: {
      minute: string;
      hour: string;
      dayOfMonth: string;
      month: string;
      dayOfWeek: string;
      command: string;
    },
  ) {
    return this.directAdmin.createHostingCronJob(id, user.userId, body);
  }

  @Delete(':id/hosting-cron/:cronId')
  async deleteHostingCron(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.directAdmin.deleteHostingCronJob(id, user.userId, cronId);
  }

  @Get(':id/hosting-staging')
  async hostingStaging(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingStaging(id, user.userId);
  }

  @Post(':id/hosting-staging')
  async createHostingStaging(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { domain: string; label?: string; withDatabase?: boolean },
  ) {
    return this.directAdmin.createHostingStaging(id, user.userId, body);
  }

  @Delete(':id/hosting-staging')
  async deleteHostingStaging(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { domain: string; subdomain: string },
  ) {
    return this.directAdmin.deleteHostingStaging(id, user.userId, body);
  }

  @Get(':id/deploy-jobs')
  async deployJobs(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listDeployJobs(id, user.userId);
  }

  @Post(':id/deploy-jobs')
  async createDeployJob(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body()
    body: { domain: string; branch?: string; buildCommand?: string; frequency: 'every_15m' | 'hourly' | 'daily' },
  ) {
    return this.directAdmin.createDeployJob(id, user.userId, body);
  }

  @Delete(':id/deploy-jobs/:cronId')
  async deleteDeployJob(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.directAdmin.deleteDeployJob(id, user.userId, cronId);
  }

  @Get(':id/hosting-ssl')
  async hostingSsl(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingSslCertificates(id, user.userId);
  }

  @Post(':id/hosting-ssl/letsencrypt')
  async hostingSslLetsencrypt(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: HostingSslLetsencryptDto,
  ) {
    return this.directAdmin.requestLetsEncryptCertificate(id, user.userId, {
      domain: body.domain,
      includeWww: body.includeWww === true,
    });
  }

  @Post(':id/hosting-ssl/paste')
  async hostingSslPaste(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: HostingSslPasteDto,
  ) {
    return this.directAdmin.pasteCustomSslCertificate(id, user.userId, {
      domain: body.domain,
      certificate: body.certificate,
      privateKey: body.privateKey,
      caBundle: body.caBundle,
    });
  }

  @Get(':id/hosting-backups')
  async hostingBackups(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingBackups(id, user.userId);
  }

  @Get(':id/hosting-backups/restore-preview')
  async hostingRestorePreview(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('backupId') backupId?: string,
  ) {
    const backups = await this.directAdmin.listHostingBackups(id, user.userId);
    const [domains, databases, mailboxes] = await Promise.all([
      this.directAdmin.listHostingDomainsForSubscription(id, user.userId),
      this.directAdmin.listHostingMysqlForSubscription(id, user.userId),
      this.directAdmin.listHostingEmailAccounts(id, user.userId),
    ]);
    const backup = backupId
      ? backups.rows.find((row) => row.id === backupId || row.fileName === backupId)
      : backups.rows[0];
    const restoreScope = backup
      ? [
          { area: 'files', source: 'DirectAdmin site backup archive', count: null },
          { area: 'domains', source: 'DirectAdmin current account inventory', count: domains.domains.length },
          { area: 'databases', source: 'DirectAdmin current account inventory', count: databases.databases.length },
          { area: 'mailboxes', source: 'DirectAdmin current account inventory', count: mailboxes.rows.length },
        ]
      : [];
    return {
      backup: backup ?? null,
      canPreview: Boolean(backup),
      restoreScope,
      warnings: [
        'Restore preview nie wykonuje zmian na koncie i bazuje na realnej liście backupów DirectAdmin.',
        'Dokładna zawartość archiwum jest potwierdzana przez worker restore przed rozpoczęciem operacji.',
      ],
      fetchError: sanitizeClientFetchError(
        backups.fetchError ?? domains.fetchError ?? databases.fetchError ?? mailboxes.fetchError,
      ),
    };
  }

  /** Enqueues an async restore of a DA backup onto the account (overwrites live data). */
  @Post(':id/hosting-restore')
  async runHostingRestore(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: HostingRestoreDto,
  ) {
    return this.hostingRestore.enqueue(id, user.userId, {
      backupId: dto.backupId,
      scopeFiles: dto.scopeFiles,
      scopeDatabases: dto.scopeDatabases,
      scopeEmail: dto.scopeEmail,
      safetyBackup: dto.safetyBackup,
      confirmDomain: dto.confirmDomain,
      isAdmin: false,
    });
  }

  @Get(':id/hosting-restore/status')
  async hostingRestoreStatus(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.hostingRestore.latestForSubscription(id, user.userId, false);
  }

  @Get(':id/health')
  async health(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.serviceHealth.getOrRefreshForSubscription(id, user.userId, {
      force: refresh === '1' || refresh === 'true',
    });
  }

  @Post(':id/health/refresh')
  async refreshHealth(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.serviceHealth.getOrRefreshForSubscription(id, user.userId, { force: true });
  }

  @Get(':id/usage')
  async usage(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('window') window = '24h',
  ) {
    await this.assertSubscriptionForUser(id, user.userId);
    const hours = window === '7d' ? 24 * 7 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    // Newest buckets first — with 1-min telemetry, 24h can exceed 1400 rows; asc+take
    // used to return the *oldest* slice, so the panel showed stale 0% / 1 MB disk.
    const rows = (
      await this.prisma.usageMetric.findMany({
        where: { subscriptionId: id, bucketStart: { gte: since } },
        orderBy: { bucketStart: 'desc' },
        take: window === '7d' ? 500 : 1440,
      })
    ).reverse();
    return {
      window,
      rows: rows.map((row) => ({
        bucketStart: row.bucketStart.toISOString(),
        bucketDurationS: row.bucketDurationS,
        cpuUsageAvg: row.cpuUsageAvg,
        cpuUsageMax: row.cpuUsageMax,
        memUsageAvgMb: row.memUsageAvgMb,
        memUsageMaxMb: row.memUsageMaxMb,
        diskUsageMb: row.diskUsageMb,
        ioUsageKbps: row.ioUsageKbps,
      })),
    };
  }

  /** G‑5: zlecenie pełnego backupu konta przez DirectAdmin (`CMD_API_SITE_BACKUP`). */
  @Post(':id/hosting-site-backup')
  async hostingSiteBackupNow(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.createHostingSiteBackupNow(id, user.userId);
  }

  /** G‑6: zgłoszenie migracji zewnętrznej (FTP/MySQL/IMAP) przez formularz klienta. */
  @Post(':id/migrations/external')
  async requestExternalMigration(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: RequestExternalMigrationDto,
  ) {
    return this.migrations.requestExternalMigration(id, user.userId, body);
  }

  /** Timeline G‑6/G‑7 dla klienta (status zgłoszenia i postęp workerów). */
  @Get(':id/migrations')
  async listMigrations(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.migrations.listMigrationTimelineForUser(id, user.userId);
  }

  /** Sprint 7 / R-MIG-1 — pakietowe zlecenie migracji ze starego hostingu. */
  @Post(':id/migrations/bundle')
  async createMigrationBundle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: CreateMigrationBundleDto,
  ) {
    return this.migrations.createBundle(id, user.userId, body);
  }

  /** Lista zleceń migracji per subskrypcja (klient widzi własne). */
  @Get(':id/migrations/bundles')
  async listMigrationBundles(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.migrations.listBundlesForUser(id, user.userId);
  }

  @Get(':id')
  async get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId: user.userId },
      include: {
        plan: true,
        account: { include: { server: { select: { id: true, name: true, region: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        healthSnapshots: { orderBy: { computedAt: 'desc' }, take: 1 },
      },
    });
    if (!sub) throw new NotFoundException('Service not found');

    if (sub.account?.daPasswordEnc) {
      const syncedDomain = await this.directAdmin.syncPrimaryDomainForSubscription(
        id,
        user.userId,
      );
      if (syncedDomain) sub.account.domain = syncedDomain;
    }

    return {
      id: sub.id,
      status: sub.status,
      plan: {
        id: sub.plan.id,
        slug: sub.plan.slug,
        name: sub.plan.name,
        description: sub.plan.description,
        cpuLimit: sub.plan.cpuLimit,
        ramLimitMb: sub.plan.ramLimitMb,
        diskLimitMb: sub.plan.diskLimitMb,
      },
      interval: sub.interval,
      paymentSource: sub.paymentSource,
      priceAmount: sub.priceAmount.toString(),
      currency: sub.currency,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      ecoModeEnabled: sub.ecoModeEnabled,
      autoscalingEnabled: sub.autoscalingEnabled,
      isTrial: sub.isTrial,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      productKind: sub.plan.productKind,
      autoscalingMaxCost: sub.autoscalingMaxCost.toString(),
      account: sub.account
        ? {
            id: sub.account.id,
            domain: sub.account.domain,
            daUsername: sub.account.daUsername,
            status: sub.account.status,
            cpuLimit: sub.account.cpuLimit,
            ramLimitMb: sub.account.ramLimitMb,
            diskLimitMb: sub.account.diskLimitMb,
            scaledCpu: sub.account.scaledCpu,
            scaledRamMb: sub.account.scaledRamMb,
            scaledDiskMb: sub.account.scaledDiskMb,
            server: sub.account.server,
          }
        : null,
      provisioning: sub.provisioningStage
        ? {
            stage: sub.provisioningStage as
              | 'queued'
              | 'running'
              | 'retrying'
              | 'failed'
              | 'completed',
            attempts: sub.provisioningAttempts,
            startedAt: sub.provisioningStartedAt?.toISOString() ?? null,
            completedAt: sub.provisioningCompletedAt?.toISOString() ?? null,
            lastError: sub.provisioningLastError
              ? humanizeProvisioningError(sub.provisioningLastError)
              : null,
          }
        : null,
      health: await this.serviceHealth.getOrRefreshForSubscription(id, user.userId),
      recommendations: buildServiceRecommendations(sub),
      events: sub.events.map((e) => ({
        id: e.id,
        type: e.type,
        details: e.details as Prisma.JsonValue,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  private async assertSubscriptionForUser(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    return sub;
  }
}

/**
 * Sprint 5 / R-11+B-7 — sanityzowany komunikat błędu dla klienta. Nie pokazujemy
 * stacktrace ani treści odpowiedzi DA, tylko klasę awarii zrozumiałą dla
 * użytkownika. Dokładny payload jest dostępny tylko w panelu admina.
 */
function humanizeProvisioningError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'Tymczasowy problem z węzłem (timeout). Próbujemy ponownie.';
  }
  if (lower.includes('all compute nodes are at capacity')) {
    return 'Brak wolnych węzłów. Operacja zostanie wznowiona automatycznie.';
  }
  if (lower.includes('cloudlinux lve limits could not be applied')) {
    return 'Konto utworzone — finalizacja limitów jest powtarzana.';
  }
  if (lower.includes('domain already exists') || lower.includes('already exists')) {
    return 'Domena jest już używana — skontaktuj się ze wsparciem.';
  }
  if (lower.includes('invalid credentials') || lower.includes('unauthorized')) {
    return 'Tymczasowy problem konfiguracyjny węzła. Wsparcie zostało powiadomione.';
  }
  return 'Konfiguracja konta została wstrzymana. Wsparcie zostało powiadomione.';
}

function sanitizeClientFetchError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'Panel hostingowy nie odpowiedział w limicie czasu. Spróbuj ponownie za chwilę.';
  }
  if (lower.includes('unauthorized') || lower.includes('credentials')) {
    return 'Panel hostingowy wymaga ponownej weryfikacji konfiguracji przez wsparcie.';
  }
  return 'Nie udało się pobrać pełnych danych z panelu hostingowego.';
}

function buildHealthSummary(s: {
  status: string;
  account: { status: string } | null;
  provisioningStage: string | null;
  healthSnapshots: {
    score: number;
    dnsOk: boolean | null;
    tlsOk: boolean | null;
    backupFresh: boolean | null;
    lveOk: boolean | null;
    panelTlsOk: boolean | null;
    mailOk: boolean | null;
    computedAt: Date;
    details: unknown;
  }[];
}) {
  const latest = s.healthSnapshots[0];
  if (!latest) {
    return {
      score: null,
      label: 'pending' as const,
      checkedAt: null,
      summary:
        s.status === 'ACTIVE' && s.account?.status === 'ACTIVE'
          ? 'Otwórz usługę, aby uruchomić pierwszą diagnostykę.'
          : 'Health score dostępny po aktywacji usługi.',
      checks: {
        dnsOk: null,
        tlsOk: null,
        backupFresh: null,
        lveOk: null,
        panelTlsOk: null,
        mailOk: null,
      },
    };
  }
  const details =
    latest.details && typeof latest.details === 'object' && !Array.isArray(latest.details)
      ? (latest.details as {
          summary?: string;
          checkDetails?: import('@verris/contracts').ServiceHealthSummaryDto['checkDetails'];
        })
      : {};
  const score = latest.score;
  const checks = {
    dnsOk: latest.dnsOk,
    tlsOk: latest.tlsOk,
    backupFresh: latest.backupFresh,
    lveOk: latest.lveOk,
    panelTlsOk: latest.panelTlsOk,
    mailOk: latest.mailOk,
  };
  return {
    score,
    label:
      score >= 80 ? ('healthy' as const) : score >= 50 ? ('attention' as const) : ('critical' as const),
    checkedAt: latest.computedAt.toISOString(),
    summary: details.summary ?? undefined,
    checks,
    checkDetails: details.checkDetails,
  };
}

function buildServiceRecommendations(s: {
  status: string;
  autoscalingEnabled: boolean;
  provisioningStage: string | null;
  account: {
    domain: string;
    scaledCpu: number;
    cpuLimit: number;
    scaledRamMb: number;
    ramLimitMb: number;
    scaledDiskMb: number;
    diskLimitMb: number;
  } | null;
  healthSnapshots: { score: number; backupFresh: boolean | null; dnsOk: boolean | null; tlsOk: boolean | null }[];
}) {
  const latest = s.healthSnapshots[0];
  const out: {
    type: 'autoscaling' | 'plan' | 'domain' | 'backup';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    body: string;
  }[] = [];
  if (s.provisioningStage === 'failed') {
    out.push({
      type: 'domain',
      severity: 'critical',
      title: 'Provisioning wymaga interwencji',
      body: 'Wsparcie widzi szczegóły błędu. Nie wykonuj ponownego zamówienia tej samej domeny.',
    });
  }
  if (
    !s.autoscalingEnabled &&
    s.account &&
    (s.account.scaledCpu > 0 ||
      s.account.scaledRamMb > 0 ||
      s.account.scaledDiskMb > 0)
  ) {
    out.push({
      type: 'autoscaling',
      severity: 'warning',
      title: 'Włącz autoscaling limitów',
      body: 'Usługa korzystała już z podwyższonych limitów. Autoscaling ograniczy ryzyko błędów 508.',
    });
  }
  if (latest?.backupFresh === false) {
    out.push({
      type: 'backup',
      severity: 'warning',
      title: 'Backup wymaga odświeżenia',
      body: 'Uruchom backup przed większymi zmianami WordPress, DNS lub migracją.',
    });
  }
  if (latest && (latest.dnsOk === false || latest.tlsOk === false)) {
    out.push({
      type: 'domain',
      severity: 'critical',
      title: 'Sprawdź DNS i SSL',
      body: 'Asystent domeny wskaże brakujące rekordy oraz problemy certyfikatu.',
    });
  }
  if (out.length === 0 && s.status === 'ACTIVE') {
    out.push({
      type: 'plan',
      severity: 'info',
      title: 'Usługa działa prawidłowo',
      body: 'Monitorujemy health score, backup, DNS/SSL i usage. Rekomendacje pojawią się automatycznie.',
    });
  }
  return out.slice(0, 3);
}

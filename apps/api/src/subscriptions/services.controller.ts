import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HostingSslLetsencryptDto, HostingSslPasteDto } from './dto/hosting-ssl.dto';
import {
  CreateMigrationBundleDto,
  DiscoverMigrationSourceDto,
  RequestExternalMigrationDto,
} from './dto/migration.dto';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { MigrationDiscoveryService } from './migration-discovery.service';
import { MigrationPreflightService } from './migration-preflight.service';
import { MigrationCutoverService } from './migration-cutover.service';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { ServiceHealthService } from './service-health.service';
import { HostingDnsPointingService } from './hosting-dns-pointing.service';
import { AssistantService } from './assistant.service';
import { CofniecieNaprawyDto, NaprawaAsystentaDto } from './dto/assistant.dto';
import { HostingRestoreService } from './hosting-restore.service';
import { OffsiteRestoreService } from './offsite-restore.service';
import { DbTransferService } from './db-transfer.service';
import { FileRestoreService } from './file-restore.service';
import { SshAccessService } from './ssh-access.service';
import { WpUpdateService } from './wp-update.service';
import { DiskUsageService } from './disk-usage.service';
import { MalwareScanService } from './malware-scan.service';
import { RedisAccessService } from './redis-access.service';
import { MailLogService } from './mail-log.service';
import { GitDeployService } from './git-deploy.service';
import { SiteCloneService } from './site-clone.service';
import { HostingRestoreDto } from './dto/hosting-restore.dto';
import { WordpressService } from './wordpress.service';
import { InstallWordpressDto } from './dto/wordpress.dto';
import { WafService } from './waf.service';
import { SetWafModeDto } from './dto/waf.dto';
import { SiteMonitorService } from './site-monitor.service';
import { StagingService } from './staging.service';
import { BackupScheduleService } from './backup-schedule.service';
import { SetMonitoringDto } from './dto/site-monitor.dto';
import { UsunRekordDnsDto, UtworzRekordDnsDto } from './dto/hosting-dns.dto';
import { ZadanieCronDto } from './dto/hosting-cron.dto';
import { UtworzKontoFtpDto, ZmienHasloFtpDto } from './dto/hosting-ftp.dto';
import { UtworzSkrzynkeDto, ZmienHasloSkrzynkiDto, ZmienRozmiarSkrzynkiDto } from './dto/hosting-email.dto';
import { EcoReportService } from '../eco/eco-report.service';
import { DeliverabilityService } from '../deliverability/deliverability.service';
import { PhpService } from './php.service';
import { AppInstallService } from './app-install.service';
import { LogiHostinguQueryDto } from './dto/hosting-logs.dto';
import {
  AliasDomenyDto,
  ArchiwumOffsiteDto,
  AutoresponderDto,
  CatchAllDto,
  DomenaDto,
  DostepZdalnyBazyDto,
  FiltrSpamuDto,
  HarmonogramKopiiDto,
  InstalacjaAplikacjiDto,
  KatalogDto,
  LogowanieSsoDto,
  MigawkaOffsiteDto,
  NarzedziaWwwDto,
  NowaBazaDanychDto,
  NowyStagingDto,
  OchronaKataloguDto,
  PrzekierowaniePocztyDto,
  SubdomenaDto,
  UzytkownikBazyDto,
  UzytkownikBazyZHaslemDto,
  WersjaPhpDomenyDto,
  UstawieniaPhpDomenyDto,
  EksportBazyDto,
  ListaArchiwumDto,
  DostepSshDto,
  KluczeSshDto,
  WordpressDomenyDto,
  AktualizacjaWordpressaDto,
  AutomatWordpressaDto,
  CacheWordpressaDto,
  ZabezpieczeniaWordpressaDto,
  DziennikPocztyDto,
  RepozytoriumGitDto,
  KlonStronyDto,
  OdtworzenieZArchiwumDto,
  ImportBazyDto,
  WersjaPhpDto,
  ZadanieDeployDto,
} from './dto/hosting-body.dto';

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
    private readonly assistant: AssistantService,
    private readonly hostingRestore: HostingRestoreService,
    private readonly offsiteRestore: OffsiteRestoreService,
    private readonly dbTransfer: DbTransferService,
    private readonly fileRestore: FileRestoreService,
    private readonly sshAccess: SshAccessService,
    private readonly wpUpdate: WpUpdateService,
    private readonly diskUsage: DiskUsageService,
    private readonly malwareScan: MalwareScanService,
    private readonly redisAccess: RedisAccessService,
    private readonly mailLog: MailLogService,
    private readonly gitDeploy: GitDeployService,
    private readonly siteClone: SiteCloneService,
    private readonly wordpress: WordpressService,
    private readonly waf: WafService,
    private readonly siteMonitor: SiteMonitorService,
    private readonly staging: StagingService,
    private readonly ecoReport: EcoReportService,
    private readonly deliverability: DeliverabilityService,
    private readonly php: PhpService,
    private readonly appInstall: AppInstallService,
    private readonly backupSchedule: BackupScheduleService,
    private readonly migrationDiscovery: MigrationDiscoveryService,
    private readonly migrationPreflight: MigrationPreflightService,
    private readonly migrationCutover: MigrationCutoverService,
  ) {}

  // PERF-1 — bardzo lekki endpoint zwracający tylko typ usługi (productKind).
  // Hub używa go do natychmiastowego doboru zakładek BEZ ciężkiego /services/:id,
  // które uruchamia live-probe health (DNS/TLS/poczta) i przez to bywa wolne.
  @Get(':id/kind')
  async serviceKind(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId: user.userId },
      select: {
        id: true,
        serviceTag: true,
        account: { select: { daUsername: true } },
        plan: { select: { productKind: true } },
      },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    return {
      productKind: sub.plan?.productKind ?? 'HOSTING',
      serviceTag: sub.serviceTag ?? sub.account?.daUsername ?? null,
    };
  }

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
    @Body() body: InstalacjaAplikacjiDto,
  ) {
    return this.appInstall.install(id, user.userId, body);
  }

  // P-2 — diagnostyka dostarczalności poczty (SPF/DKIM/DMARC + RBL).
  // PB-17 — dymki asystenta (reguły, bez AI).
  @Get(':id/assistant-hints')
  assistantHints(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.assistant.hints(id, user.userId);
  }

  // PB-17 — naprawa jednym kliknięciem (rekord w strefie DNS, więc trasa pod
  // hosting-dns: subkonto potrzebuje DNS_MANAGE, nie tylko SERVICES_MANAGE).
  @Post(':id/hosting-dns/assistant-fix')
  assistantFix(
    @CurrentUser() user: { userId: string; principalUserId?: string },
    @Param('id') id: string,
    @Body() body: NaprawaAsystentaDto,
  ) {
    return this.assistant.applyFix(id, user.userId, user.principalUserId ?? user.userId, body.key);
  }

  @Post(':id/hosting-dns/assistant-undo')
  assistantUndo(
    @CurrentUser() user: { userId: string; principalUserId?: string },
    @Param('id') id: string,
    @Body() body: CofniecieNaprawyDto,
  ) {
    return this.assistant.undoFix(id, user.userId, user.principalUserId ?? user.userId, body.undoId);
  }

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
    @Body() body: WersjaPhpDto,
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

  // MON-6 — przełącznik powiadomień e-mail (monitoring działa niezależnie)
  @Post(':id/monitoring/notify')
  setMonitoringNotify(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SetMonitoringDto,
  ) {
    return this.siteMonitor.setNotifyEmail(id, user.userId, dto.enabled);
  }

  // MON-3 — płatny monitoring (szybkie sprawdzanie), rozliczany miesięcznie z portfela
  @Post(':id/monitoring/paid')
  setPaidMonitoring(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: SetMonitoringDto,
  ) {
    return this.siteMonitor.setPaidMonitoring(id, user.userId, dto.enabled);
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
      serviceTag: s.serviceTag ?? s.account?.daUsername ?? null,
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

  @Post(':id/hosting-databases')
  async createHostingDatabase(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: NowaBazaDanychDto,
  ) {
    return this.directAdmin.createHostingMysqlDatabase(id, user.userId, {
      name: body?.name,
      user: body?.user,
      password: body?.password,
    });
  }

  @Delete(':id/hosting-databases/:name')
  async deleteHostingDatabase(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('name') name: string,
  ) {
    return this.directAdmin.deleteHostingMysqlDatabase(id, user.userId, name);
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

  /** K-04/K-05 — ostatnie linie logu dostępu / błędów domeny konta. */
  @Get(':id/hosting-logs')
  async hostingLogs(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query() q: LogiHostinguQueryDto,
  ) {
    return this.directAdmin.readHostingLog(id, user.userId, q);
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
    @Body() body: UtworzRekordDnsDto,
  ) {
    return this.directAdmin.createHostingDnsRecord(id, user.userId, body);
  }

  @Delete(':id/hosting-dns')
  async deleteHostingDns(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UsunRekordDnsDto,
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
    @Body() body: UtworzKontoFtpDto,
  ) {
    return this.directAdmin.createHostingFtpAccount(id, user.userId, body);
  }

  // C-18 — zmiana hasła konta FTP bez usuwania i zakładania od nowa.
  @Post(':id/hosting-ftp/:username/password')
  async changeHostingFtpPassword(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('username') username: string,
    @Body() body: ZmienHasloFtpDto,
  ) {
    return this.directAdmin.changeHostingFtpPassword(id, user.userId, decodeURIComponent(username), body.password);
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
    @Body() body: UtworzSkrzynkeDto,
  ) {
    return this.directAdmin.createHostingEmailAccount(id, user.userId, body);
  }

  @Post(':id/hosting-email/password')
  async changeHostingEmailPassword(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ZmienHasloSkrzynkiDto,
  ) {
    return this.directAdmin.changeHostingEmailPassword(id, user.userId, body);
  }

  // E-05 — zmiana rozmiaru istniejącej skrzynki (bez usuwania i odtwarzania).
  @Post(':id/hosting-email/quota')
  async changeHostingEmailQuota(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ZmienRozmiarSkrzynkiDto,
  ) {
    return this.directAdmin.changeHostingEmailQuota(id, user.userId, body);
  }

  @Delete(':id/hosting-email/:email')
  async deleteHostingEmail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('email') email: string,
  ) {
    return this.directAdmin.deleteHostingEmailAccount(id, user.userId, decodeURIComponent(email));
  }

  @Get(':id/hosting-email-forwarders')
  async hostingEmailForwarders(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingEmailForwarders(id, user.userId);
  }

  @Post(':id/hosting-email-forwarders')
  async createHostingEmailForwarder(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: PrzekierowaniePocztyDto,
  ) {
    return this.directAdmin.createHostingEmailForward(id, user.userId, body);
  }

  @Delete(':id/hosting-email-forwarders/:name')
  async deleteHostingEmailForwarder(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('name') name: string,
  ) {
    return this.directAdmin.deleteHostingEmailForward(id, user.userId, decodeURIComponent(name));
  }

  @Get(':id/hosting-autoresponders')
  async hostingAutoresponders(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingAutoresponders(id, user.userId);
  }

  @Post(':id/hosting-autoresponders')
  async setHostingAutoresponderEndpoint(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: AutoresponderDto,
  ) {
    return this.directAdmin.setHostingAutoresponder(id, user.userId, body);
  }

  @Delete(':id/hosting-autoresponders/:name')
  async deleteHostingAutoresponderEndpoint(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('name') name: string,
  ) {
    return this.directAdmin.deleteHostingAutoresponder(id, user.userId, decodeURIComponent(name));
  }

  @Get(':id/hosting-webtools')
  async hostingWebTools(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getHostingWebTools(id, user.userId);
  }

  @Post(':id/hosting-webtools')
  async saveHostingWebTools(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: NarzedziaWwwDto,
  ) {
    return this.directAdmin.saveHostingWebTools(id, user.userId, body);
  }

  @Post(':id/hosting-dir-protection')
  async setHostingDirProtection(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: OchronaKataloguDto,
  ) {
    return this.directAdmin.setHostingDirectoryProtection(id, user.userId, body);
  }

  @Post(':id/hosting-dir-protection/remove')
  async removeHostingDirProtection(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: KatalogDto,
  ) {
    return this.directAdmin.removeHostingDirectoryProtection(id, user.userId, body.dir);
  }

  @Get(':id/hosting-additional-domains')
  async hostingAdditionalDomains(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingAdditionalDomains(id, user.userId);
  }

  @Post(':id/hosting-additional-domains')
  async createHostingAdditionalDomain(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: DomenaDto,
  ) {
    return this.directAdmin.createHostingAdditionalDomain(id, user.userId, body);
  }

  @Delete(':id/hosting-additional-domains/:domain')
  async deleteHostingAdditionalDomain(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('domain') domain: string,
  ) {
    return this.directAdmin.deleteHostingAdditionalDomain(id, user.userId, decodeURIComponent(domain));
  }

  @Get(':id/hosting-domain-pointers')
  async hostingDomainPointers(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingDomainPointers(id, user.userId);
  }

  @Post(':id/hosting-domain-pointers')
  async createHostingDomainPointer(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: AliasDomenyDto,
  ) {
    return this.directAdmin.createHostingDomainPointer(id, user.userId, body);
  }

  @Delete(':id/hosting-domain-pointers/:alias')
  async deleteHostingDomainPointer(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('alias') alias: string,
  ) {
    return this.directAdmin.deleteHostingDomainPointer(id, user.userId, decodeURIComponent(alias));
  }

  @Get(':id/hosting-catchall')
  async hostingCatchAll(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getHostingCatchAll(id, user.userId);
  }

  @Post(':id/hosting-catchall')
  async setHostingCatchAll(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: CatchAllDto,
  ) {
    return this.directAdmin.setHostingCatchAll(id, user.userId, body);
  }

  @Get(':id/hosting-spamfilter')
  async hostingSpamFilter(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getHostingSpamFilter(id, user.userId);
  }

  @Post(':id/hosting-spamfilter')
  async setHostingSpamFilter(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: FiltrSpamuDto,
  ) {
    return this.directAdmin.setHostingSpamFilter(id, user.userId, body);
  }

  @Get(':id/hosting-db-access-hosts')
  async hostingDbAccessHosts(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('db') db: string,
  ) {
    return this.directAdmin.listHostingDbAccessHosts(id, user.userId, db);
  }

  @Post(':id/hosting-db-access-hosts')
  async addHostingDbAccessHost(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: DostepZdalnyBazyDto,
  ) {
    return this.directAdmin.addHostingDbAccessHost(id, user.userId, body);
  }

  @Post(':id/hosting-db-access-hosts/remove')
  async removeHostingDbAccessHost(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: DostepZdalnyBazyDto,
  ) {
    return this.directAdmin.deleteHostingDbAccessHost(id, user.userId, body);
  }

  // ───────────────────────── SPRINT-1a — użytkownicy baz MySQL ─────────────────
  // UI (DbUsers.tsx) i warstwa DirectAdmin powstały w lipcu 2026, ale trasy nigdy
  // nie zostały dopisane — każde kliknięcie kończyło się 404. Pozycje D-04…D-07.

  @Get(':id/hosting-db-users')
  async hostingDbUsers(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('db') db: string,
  ) {
    return this.directAdmin.listHostingDbUsers(id, user.userId, db);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:db-user-create' })
  @Post(':id/hosting-db-users')
  async addHostingDbUser(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UzytkownikBazyZHaslemDto,
  ) {
    return this.directAdmin.createHostingDbUser(id, user.userId, body);
  }

  @Post(':id/hosting-db-users/remove')
  async removeHostingDbUser(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UzytkownikBazyDto,
  ) {
    return this.directAdmin.deleteHostingDbUser(id, user.userId, body);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:db-user-password' })
  @Post(':id/hosting-db-users/password')
  async changeHostingDbUserPassword(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UzytkownikBazyZHaslemDto,
  ) {
    return this.directAdmin.changeHostingDbUserPassword(id, user.userId, body);
  }

  // ───────────────────────── SPRINT-1c — SSO do phpMyAdmin / webmaila ──────────
  // Jednorazowy link DirectAdmin ważny 2 minuty. Bez tej trasy panel wpadał
  // w cichy fallback „Auto-logowanie niedostępne”. Pozycje D-11 i E-14.

  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000, scope: 'hosting:sso-url' })
  @Post(':id/hosting-sso-url')
  async hostingSsoUrl(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: LogowanieSsoDto,
  ) {
    return this.directAdmin.createHostingSsoUrl(id, user.userId, body.target);
  }

  // ───────────────────────── FALA-2b — wersja PHP per domena ───────────────────
  // Obok per-kontowego selektora CloudLinux. Ustawienie per domena ma pierwszeństwo
  // dla danego vhosta — panel sygnalizuje to przy selektorze konta. Pozycja B-02.

  @Get(':id/hosting-domain-php')
  async hostingDomainPhp(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('domain') domain: string,
  ) {
    return this.directAdmin.getHostingDomainPhp(id, user.userId, domain);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:domain-php' })
  @Post(':id/hosting-domain-php')
  async setHostingDomainPhp(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: WersjaPhpDomenyDto,
  ) {
    return this.directAdmin.setHostingDomainPhp(id, user.userId, body);
  }

  // B-05 — ustawienia PHP per domena (.user.ini, blok zarządzany przez panel).
  @Get(':id/hosting-php-ini')
  async hostingPhpIni(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('domain') domain: string,
  ) {
    return this.directAdmin.getHostingPhpIni(id, user.userId, domain);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:php-ini' })
  @Post(':id/hosting-php-ini')
  async setHostingPhpIni(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UstawieniaPhpDomenyDto,
  ) {
    return this.directAdmin.setHostingPhpIni(id, user.userId, body);
  }

  @Get(':id/hosting-cron')
  async hostingCron(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingCronJobs(id, user.userId);
  }

  @Get(':id/hosting-cron-output')
  async hostingCronOutput(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Query('key') key: string) {
    return this.directAdmin.getHostingCronOutput(id, user.userId, key);
  }

  @Post(':id/hosting-cron')
  async createHostingCron(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ZadanieCronDto,
  ) {
    return this.directAdmin.createHostingCronJob(id, user.userId, body);
  }

  /** L-03 — edycja zadania cron (DA nie ma modyfikacji: nowe, potem usunięcie starego). */
  @Put(':id/hosting-cron/:cronId')
  async updateHostingCron(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('cronId') cronId: string,
    @Body() body: ZadanieCronDto,
  ) {
    return this.directAdmin.updateHostingCronJob(id, user.userId, cronId, body);
  }

  @Delete(':id/hosting-cron/:cronId')
  async deleteHostingCron(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.directAdmin.deleteHostingCronJob(id, user.userId, cronId);
  }

  @Get(':id/hosting-subdomains')
  async hostingSubdomains(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingSubdomains(id, user.userId);
  }

  @Post(':id/hosting-subdomains')
  async createHostingSubdomain(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: SubdomenaDto,
  ) {
    return this.directAdmin.createHostingSubdomain(id, user.userId, body);
  }

  @Post(':id/hosting-subdomains/delete')
  async deleteHostingSubdomain(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: SubdomenaDto,
  ) {
    return this.directAdmin.deleteHostingSubdomain(id, user.userId, body);
  }

  @Get(':id/hosting-staging')
  async hostingStaging(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.listHostingStaging(id, user.userId);
  }

  @Post(':id/hosting-staging')
  async createHostingStaging(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: NowyStagingDto,
  ) {
    return this.directAdmin.createHostingStaging(id, user.userId, body);
  }

  @Delete(':id/hosting-staging')
  async deleteHostingStaging(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: SubdomenaDto,
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
    @Body() body: ZadanieDeployDto,
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
      wildcard: body.wildcard === true,
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

  // S-1 — kopie OFF-SITE (poza węzłem). Panel nie ma kluczy do storage'u, więc
  // listowanie i pobranie archiwum wykonuje węzeł zadaniem OFFSITE_RESTORE.
  // Po pobraniu archiwum trafia na zwykłą listę kopii DA i odtwarza się
  // istniejącą ścieżką /hosting-restore (kopia bezpieczeństwa + potwierdzenie).
  // D-12 — eksport/import bazy przez agenta węzła (katalog ~/verris-bazy).
  @Get(':id/hosting-db-transfer')
  async hostingDbTransfer(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.dbTransfer.status(id, user.userId);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'hosting:db-transfer' })
  @Post(':id/hosting-db-export')
  async hostingDbExport(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: EksportBazyDto) {
    return this.dbTransfer.zlecEksport(id, user.userId, body.db);
  }

  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'hosting:db-transfer' })
  @Post(':id/hosting-db-import')
  async hostingDbImport(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: ImportBazyDto) {
    return this.dbTransfer.zlecImport(id, user.userId, body.db, body.file);
  }

  // H-10/H-11 — podgląd archiwum kopii i odtworzenie pliku do ~/verris-odtworzone.
  @Get(':id/hosting-file-restore')
  async hostingFileRestore(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.fileRestore.status(id, user.userId);
  }

  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'hosting:file-restore' })
  @Post(':id/hosting-file-restore/list')
  async hostingFileRestoreList(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: ListaArchiwumDto) {
    return this.fileRestore.zlecListe(id, user.userId, body.archive, body.path);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:file-restore' })
  @Post(':id/hosting-file-restore/extract')
  async hostingFileRestoreExtract(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: OdtworzenieZArchiwumDto) {
    return this.fileRestore.zlecOdtworzenie(id, user.userId, body.archive, body.path);
  }

  // C-21/C-22 — SSH w klatce CageFS i klucze SSH (zadanie węzła).
  @Get(':id/hosting-ssh')
  async hostingSsh(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.sshAccess.status(id, user.userId);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'hosting:ssh' })
  @Post(':id/hosting-ssh')
  async setHostingSsh(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: DostepSshDto) {
    return this.sshAccess.przelacz(id, user.userId, body.enabled);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:ssh' })
  @Post(':id/hosting-ssh/keys')
  async setHostingSshKeys(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: KluczeSshDto) {
    return this.sshAccess.ustawKlucze(id, user.userId, body.keys);
  }

  // I-04/I-05 — aktualizacje WordPressa domeny (zadanie węzła, kopia + wycofanie).
  @Get(':id/hosting-wp-updates')
  async hostingWpUpdates(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Query('domain') domain: string) {
    return this.wpUpdate.status(id, user.userId, domain);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:wp-update' })
  @Post(':id/hosting-wp-updates/check')
  async checkHostingWpUpdates(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: WordpressDomenyDto) {
    return this.wpUpdate.sprawdz(id, user.userId, body.domain);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'hosting:wp-update' })
  @Post(':id/hosting-wp-updates/run')
  async runHostingWpUpdates(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: AktualizacjaWordpressaDto) {
    return this.wpUpdate.aktualizuj(id, user.userId, body);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:wp-update' })
  @Post(':id/hosting-wp-updates/cache')
  async hostingWpCache(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: CacheWordpressaDto) {
    return this.wpUpdate.cache(id, user.userId, body);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:wp-update' })
  @Post(':id/hosting-wp-updates/harden')
  async hostingWpHarden(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: ZabezpieczeniaWordpressaDto) {
    return this.wpUpdate.zabezpiecz(id, user.userId, body);
  }

  @Post(':id/hosting-wp-updates/auto')
  async setHostingWpAutoUpdates(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: AutomatWordpressaDto) {
    return this.wpUpdate.ustawAutomat(id, user.userId, body);
  }

  // C-15/K-03 — co zajmuje miejsce na koncie (zadanie węzła).
  @Get(':id/hosting-disk-usage')
  async hostingDiskUsage(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.diskUsage.status(id, user.userId);
  }

  @RateLimit({ limit: 12, windowMs: 60 * 60 * 1000, scope: 'hosting:disk-usage' })
  @Post(':id/hosting-disk-usage')
  async countHostingDiskUsage(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.diskUsage.policz(id, user.userId);
  }

  // G-11 — skaner złośliwego oprogramowania (ImunifyAV, zadanie węzła).
  @Get(':id/hosting-malware')
  async hostingMalware(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.malwareScan.status(id, user.userId);
  }

  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000, scope: 'hosting:malware-scan' })
  @Post(':id/hosting-malware/scan')
  async scanHostingMalware(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.malwareScan.zlec(id, user.userId, 'scan');
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:malware-list' })
  @Post(':id/hosting-malware/refresh')
  async refreshHostingMalware(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.malwareScan.zlec(id, user.userId, 'list');
  }

  // D-15/J-03 — Redis konta (zadanie węzła).
  @Get(':id/hosting-redis')
  async hostingRedis(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.redisAccess.status(id, user.userId);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'hosting:redis' })
  @Post(':id/hosting-redis')
  async setHostingRedis(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: DostepSshDto) {
    return this.redisAccess.przelacz(id, user.userId, body.enabled);
  }

  // E-19 — dziennik dostarczania poczty (zadanie węzła).
  @Get(':id/hosting-mail-log')
  async hostingMailLog(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.mailLog.status(id, user.userId);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:mail-log' })
  @Post(':id/hosting-mail-log')
  async loadHostingMailLog(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: DziennikPocztyDto) {
    return this.mailLog.zlec(id, user.userId, body.address);
  }

  // C-25/C-26 — repozytorium Git strony (zadanie węzła).
  @Get(':id/hosting-git')
  async hostingGit(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Query('domain') domain: string) {
    return this.gitDeploy.status(id, user.userId, domain);
  }

  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'hosting:git-webhook' })
  @Post(':id/hosting-git-webhook')
  async hostingGitWebhook(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: RepozytoriumGitDto) {
    return this.gitDeploy.utworzWebhook(id, user.userId, body);
  }

  @Post(':id/hosting-git-webhook/delete')
  async hostingGitWebhookDelete(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: RepozytoriumGitDto) {
    return this.gitDeploy.usunWebhook(id, user.userId, body);
  }

  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'hosting:git' })
  @Post(':id/hosting-git/:tryb')
  async hostingGitOp(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Param('tryb') tryb: string, @Body() body: RepozytoriumGitDto) {
    if (tryb !== 'key' && tryb !== 'clone' && tryb !== 'pull') throw new NotFoundException();
    return this.gitDeploy.zlec(id, user.userId, tryb, body);
  }

  // I-13 — kopia strony na inną domenę konta (zadanie węzła).
  @Get(':id/hosting-site-clone')
  async hostingSiteClone(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.siteClone.status(id, user.userId);
  }

  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000, scope: 'hosting:site-clone' })
  @Post(':id/hosting-site-clone')
  async hostingSiteCloneRun(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() body: KlonStronyDto) {
    return this.siteClone.klonuj(id, user.userId, body);
  }

  @Get(':id/hosting-offsite')
  hostingOffsiteStatus(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.offsiteRestore.status(id, user.userId);
  }

  @Post(':id/hosting-offsite/list')
  @HttpCode(200)
  hostingOffsiteList(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: MigawkaOffsiteDto,
  ) {
    return this.offsiteRestore.queueList(id, user.userId, body?.snapshot);
  }

  @Post(':id/hosting-offsite/fetch')
  @HttpCode(200)
  hostingOffsiteFetch(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ArchiwumOffsiteDto,
  ) {
    return this.offsiteRestore.queueFetch(id, user.userId, body?.archive, body?.snapshot);
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

  /** PANEL-11: harmonogram automatycznych backupów konta. */
  @Get(':id/hosting-backup-schedule')
  async hostingBackupSchedule(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.backupSchedule.get(id, user.userId);
  }

  @Post(':id/hosting-backup-schedule')
  async setHostingBackupSchedule(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: HarmonogramKopiiDto,
  ) {
    return this.backupSchedule.set(id, user.userId, body);
  }

  /** PANEL-12: statystyki konta — transfer/dysk/liczniki (DA SHOW_USER_USAGE + CONFIG). */
  @Get(':id/hosting-stats')
  async hostingStats(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.directAdmin.getHostingAccountStats(id, user.userId);
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

  /**
   * Migrator v2 / O-2+#18 — auto-discovery: logujemy się do panelu starego
   * hostingu (cPanel/DA/Plesk) i zwracamy domeny, bazy i skrzynki do pre-fillu
   * kreatora. Sekrety nie są zapisywane.
   */
  @Post(':id/migrations/discover')
  @HttpCode(200)
  // Endpoint nawiązuje połączenia wychodzące pod adres podany przez klienta —
  // limit chroni przed użyciem go jako skanera portów / sondy SSRF.
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'migration:discover' })
  async discoverMigrationSource(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: DiscoverMigrationSourceDto,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId: user.userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    return this.migrationDiscovery.discover(body, user.userId, id);
  }

  /**
   * Migrator v2 — preflight: realny test logowania do każdego źródła
   * (FTP/FTPS pełny login, IMAP pełny login, MySQL handshake, SSH baner)
   * PRZED zakolejkowaniem. Body = ten sam kształt co bundle.
   */
  @Post(':id/migrations/preflight')
  @HttpCode(200)
  // Preflight łączy się z host:port podanym przez klienta — ten sam wektor
  // nadużycia co discover, więc również limitowany.
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'migration:preflight' })
  async preflightMigration(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: CreateMigrationBundleDto,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId: user.userId },
      select: { id: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    return this.migrationPreflight.preflightBundle(body, user.userId, id);
  }

  /** Migrator v2 — szczegóły zlecenia z krokami i postępem na żywo (polling z panelu). */
  @Get(':id/migrations/bundles/:migrationId')
  async getMigrationBundleDetail(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
  ) {
    return this.migrations.getBundleDetailForUser(id, user.userId, migrationId);
  }

  /** Migrator v2 — anulowanie migracji przez klienta (zatrzymuje worker). */
  @Post(':id/migrations/bundles/:migrationId/cancel')
  @HttpCode(200)
  async cancelMigrationBundle(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
  ) {
    return this.migrations.cancelBundle(id, user.userId, migrationId);
  }

  /** Migrator v2 — delta-sync plików i poczty przed cutoverem DNS. */
  @Post(':id/migrations/bundles/:migrationId/delta-sync')
  @HttpCode(200)
  async queueMigrationDeltaSync(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
  ) {
    return this.migrations.queueDeltaSync(id, user.userId, migrationId);
  }

  /** Migrator v2 — plan cutoveru DNS (rekordy do ustawienia / opcja zmiany NS). */
  @Get(':id/migrations/bundles/:migrationId/cutover')
  async getMigrationCutoverPlan(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
  ) {
    return this.migrationCutover.plan(id, user.userId, migrationId);
  }

  /** Migrator v2 — weryfikacja DNS po zmianie u rejestratora; sukces = cutover done. */
  @Post(':id/migrations/bundles/:migrationId/cutover/verify')
  @HttpCode(200)
  async verifyMigrationCutover(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('migrationId') migrationId: string,
  ) {
    return this.migrationCutover.verify(id, user.userId, migrationId);
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
      serviceTag: sub.serviceTag ?? sub.account?.daUsername ?? null,
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
  plan?: { productKind?: string | null } | null;
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
  const usedScaling =
    !!s.account &&
    (s.account.scaledCpu > 0 || s.account.scaledRamMb > 0 || s.account.scaledDiskMb > 0);
  if (!s.autoscalingEnabled && usedScaling) {
    out.push({
      type: 'autoscaling',
      severity: 'warning',
      title: 'Włącz autoscaling limitów',
      body: 'Usługa korzystała już z podwyższonych limitów. Autoscaling ograniczy ryzyko błędów 508.',
    });
  } else if (s.autoscalingEnabled && usedScaling && s.status === 'ACTIVE') {
    // #19 — upsell oparty na realnym użyciu: konto regularnie sięga po
    // dopłacane (godzinowe) zasoby autoskalowania, więc wyższy plan ze stałą
    // ceną bywa tańszy i stabilniejszy niż ciągłe dopłaty.
    out.push({
      type: 'plan',
      severity: 'info',
      title: 'Rozważ wyższy plan',
      body: 'Twoja usługa regularnie korzysta z autoskalowania (dopłaty godzinowe). Wyższy plan ze stałą ceną może być tańszy i bardziej przewidywalny.',
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
  const isEmail = s.plan?.productKind === 'EMAIL';
  if (latest && (latest.dnsOk === false || latest.tlsOk === false)) {
    out.push(
      isEmail
        ? {
            type: 'domain',
            severity: 'critical',
            title: 'Skonfiguruj DNS poczty',
            body: 'Ustaw rekordy MX, SPF i DKIM, aby poczta działała i nie trafiała do spamu — Asystent domeny wskaże brakujące rekordy.',
          }
        : {
            type: 'domain',
            severity: 'critical',
            title: 'Sprawdź DNS i SSL',
            body: 'Asystent domeny wskaże brakujące rekordy oraz problemy certyfikatu.',
          },
    );
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

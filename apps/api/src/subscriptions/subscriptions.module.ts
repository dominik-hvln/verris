import { WarunkiIndywidualneService } from './warunki-indywidualne.service.js';
import { WarunkiIndywidualneAdminController } from './warunki-indywidualne.admin.controller.js';
import { forwardRef, Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NodeSelectorService } from './node-selector.service.js';
import { ProvisioningService } from './provisioning.service.js';
import { ProvisioningQueueService } from './provisioning-queue.service.js';
import { ProvisioningQueueAdminController } from './provisioning-queue.admin.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { PlanChangeService } from './plan-change.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsAdminController } from './subscriptions.admin.controller.js';
import { MigrationsAdminController } from './migrations.admin.controller.js';
import { UserServicesController } from './services.controller.js';
import { RenewalScheduler } from './renewal.scheduler.js';
import { SubscriptionAbandonmentScheduler } from './subscription-abandonment.scheduler.js';
import { RenewalReminderScheduler } from './renewal-reminder.scheduler.js';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';
import { MigrationDiscoveryService } from './migration-discovery.service.js';
import { MigrationPreflightService } from './migration-preflight.service.js';
import { MigrationCutoverService } from './migration-cutover.service.js';
import { MigrationsStaffController } from './migrations.staff.controller.js';
import { MigrationWorkerScheduler } from './migration-worker.scheduler.js';
import { MigrationWorkerController } from './migration-worker.controller.js';
import { ServiceHealthService } from './service-health.service.js';
import { HostingDnsPointingService } from './hosting-dns-pointing.service.js';
import { AssistantService } from './assistant.service.js';
import { HostingRestoreService } from './hosting-restore.service.js';
import { OffsiteRestoreService } from './offsite-restore.service.js';
import { DbTransferService } from './db-transfer.service.js';
import { FileRestoreService } from './file-restore.service.js';
import { SshAccessService } from './ssh-access.service.js';
import { WpUpdateService } from './wp-update.service.js';
import { DiskUsageService } from './disk-usage.service.js';
import { MalwareScanService } from './malware-scan.service.js';
import { RedisAccessService } from './redis-access.service.js';
import { MailLogService } from './mail-log.service.js';
import { GitDeployService } from './git-deploy.service.js';
import { SiteCloneService } from './site-clone.service.js';
import { HtaccessService } from './htaccess.service.js';
import { PhpInfoService } from './php-info.service.js';
import { FileSearchService } from './file-search.service.js';
import { AppSelectorService } from './app-selector.service.js';
import { WpPodatnosciService } from './wp-podatnosci.service.js';
import { OdtworzenieNaWezleService } from './odtworzenie-na-wezle.service.js';
import { SlowSqlService } from './slow-sql.service.js';
import { PgsqlService } from './pgsql.service.js';
import { ObrazyService } from './obrazy.service.js';
import { SiteStatsService } from './site-stats.service.js';
import { PublicApiWriteController } from './public-api-write.controller.js';
import { GitWebhookController } from './git-webhook.controller.js';
import { ApiTokensModule } from '../api-tokens/api-tokens.module.js';
import { WpAutoUpdateScheduler } from './wp-auto-update.scheduler.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { HostingRestoreScheduler } from './hosting-restore.scheduler.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { WordpressService } from './wordpress.service.js';
import { WafService } from './waf.service.js';
import { WafAdminController } from './waf.admin.controller.js';
import { SiteMonitorService } from './site-monitor.service.js';
import { StagingService } from './staging.service.js';
import { TrialService } from './trial.service.js';
import { TrialExpiryScheduler } from './trial-expiry.scheduler.js';
import { PhpService } from './php.service.js';
import { AppInstallService } from './app-install.service.js';
import { DeliverabilityService } from '../deliverability/deliverability.service.js';
import { BackupScheduleService } from './backup-schedule.service.js';
import { BackupScheduleScheduler } from './backup-schedule.scheduler.js';
import { QuotaAlertScheduler } from './quota-alert.scheduler.js';
import { EcoModule } from '../eco/eco.module.js';

@Module({
  imports: [ServersModule, PlatformSettingsModule, EcoModule, forwardRef(() => BillingModule), MailModule, NotificationsModule, ApiTokensModule],
  providers: [
    SubscriptionsService,
    WarunkiIndywidualneService,
    PlanChangeService,
    ProvisioningService,
    ProvisioningQueueService,
    NodeSelectorService,
    RenewalScheduler,
    SubscriptionAbandonmentScheduler,
    RenewalReminderScheduler,
    MigrationOrchestratorService,
    MigrationDiscoveryService,
    MigrationPreflightService,
    MigrationCutoverService,
    MigrationWorkerScheduler,
    ServiceHealthService,
    DiagnosticsService,
    HostingDnsPointingService,
    AssistantService,
    HostingRestoreService,
    HostingRestoreScheduler,
    OffsiteRestoreService,
    DbTransferService,
    FileRestoreService,
    SshAccessService,
    WpUpdateService,
    DiskUsageService,
    MalwareScanService,
    RedisAccessService,
    MailLogService,
    GitDeployService,
    SiteCloneService,
    HtaccessService,
    PhpInfoService,
    FileSearchService,
    AppSelectorService,
    WpPodatnosciService,
    OdtworzenieNaWezleService,
    SlowSqlService,
    PgsqlService,
    ObrazyService,
    SiteStatsService,
    WpAutoUpdateScheduler,
    WordpressService,
    WafService,
    SiteMonitorService,
    TrialService,
    TrialExpiryScheduler,
    PhpService,
    AppInstallService,
    DeliverabilityService,
    StagingService,
    BackupScheduleService,
    BackupScheduleScheduler,
    QuotaAlertScheduler,
  ],
  controllers: [
    SubscriptionsController,
    SubscriptionsAdminController,
    WarunkiIndywidualneAdminController,
    UserServicesController,
    PublicApiWriteController,
    GitWebhookController,
    ProvisioningQueueAdminController,
    MigrationsAdminController,
    MigrationsStaffController,
    MigrationWorkerController,
    WafAdminController,
  ],
  exports: [
    SubscriptionsService,
    ProvisioningService,
    ProvisioningQueueService,
    MigrationOrchestratorService,
  ],
})
export class SubscriptionsModule {}

import { forwardRef, Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module';
import { BillingModule } from '../billing/billing.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NodeSelectorService } from './node-selector.service';
import { ProvisioningService } from './provisioning.service';
import { ProvisioningQueueService } from './provisioning-queue.service';
import { ProvisioningQueueAdminController } from './provisioning-queue.admin.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlanChangeService } from './plan-change.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsAdminController } from './subscriptions.admin.controller';
import { MigrationsAdminController } from './migrations.admin.controller';
import { UserServicesController } from './services.controller';
import { RenewalScheduler } from './renewal.scheduler';
import { SubscriptionAbandonmentScheduler } from './subscription-abandonment.scheduler';
import { RenewalReminderScheduler } from './renewal-reminder.scheduler';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { MigrationDiscoveryService } from './migration-discovery.service';
import { MigrationPreflightService } from './migration-preflight.service';
import { MigrationCutoverService } from './migration-cutover.service';
import { MigrationsStaffController } from './migrations.staff.controller';
import { MigrationWorkerScheduler } from './migration-worker.scheduler';
import { MigrationWorkerController } from './migration-worker.controller';
import { ServiceHealthService } from './service-health.service';
import { HostingDnsPointingService } from './hosting-dns-pointing.service';
import { HostingRestoreService } from './hosting-restore.service';
import { OffsiteRestoreService } from './offsite-restore.service';
import { DiagnosticsService } from './diagnostics.service';
import { HostingRestoreScheduler } from './hosting-restore.scheduler';
import { PublicUptimeBadgeController } from './public-uptime-badge.controller';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { WordpressService } from './wordpress.service';
import { WafService } from './waf.service';
import { WafAdminController } from './waf.admin.controller';
import { SiteMonitorService } from './site-monitor.service';
import { StagingService } from './staging.service';
import { TrialService } from './trial.service';
import { TrialExpiryScheduler } from './trial-expiry.scheduler';
import { PhpService } from './php.service';
import { AppInstallService } from './app-install.service';
import { DeliverabilityService } from '../deliverability/deliverability.service';
import { BackupScheduleService } from './backup-schedule.service';
import { BackupScheduleScheduler } from './backup-schedule.scheduler';
import { QuotaAlertScheduler } from './quota-alert.scheduler';
import { EcoModule } from '../eco/eco.module';

@Module({
  imports: [ServersModule, PlatformSettingsModule, EcoModule, forwardRef(() => BillingModule), MailModule, NotificationsModule],
  providers: [
    SubscriptionsService,
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
    HostingRestoreService,
    HostingRestoreScheduler,
    OffsiteRestoreService,
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
    UserServicesController,
    ProvisioningQueueAdminController,
    MigrationsAdminController,
    MigrationsStaffController,
    MigrationWorkerController,
    PublicUptimeBadgeController,
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

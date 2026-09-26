import { Module } from '@nestjs/common';
import { BadgesModule } from './badges/badges.module.js';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { KontekstZadaniaInterceptor } from './common/audit/kontekst-zadania.js';

import { loadConfig } from './config/configuration.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { ObjectStorageModule } from './storage/object-storage.module.js';

import { AuthModule } from './auth/auth.module.js';
import { ServersModule } from './servers/servers.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SearchModule } from './search/search.module.js';
import { BusinessMetricsModule } from './metrics/business-metrics.module.js';
import { DomainsModule } from './domains/domains.module.js';
import { UsersModule } from './users/users.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { BillingModule } from './billing/billing.module.js';
import { HealthModule } from './health/health.module.js';
import { PlansModule } from './plans/plans.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { AutoscalingModule } from './autoscaling/autoscaling.module.js';
import { StatusModule } from './status/status.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { MailModule } from './mail/mail.module.js';
import { SecurityModule } from './security/security.module.js';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { MarketingModule } from './marketing/marketing.module.js';
import { EmailLogAdminModule } from './email-log/email-log-admin.module.js';
import { ProductOpsModule } from './product-ops/product-ops.module.js';
import { CustomerPermissionsGuard } from './common/guards/customer-permissions.guard.js';
import { RateLimitGuard } from './common/guards/rate-limit.guard.js';
import { AiModule } from './ai/ai.module.js';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module.js';
import { LiveReadinessModule } from './admin-readiness/live-readiness.module.js';
import { VpsModule } from './vps/vps.module.js';
import { PublicStatsModule } from './public-stats/public-stats.module.js';
import { AddonModule } from './addons/addon.module.js';
import { FilesModule } from './files/files.module.js';
import { StaffRolesModule } from './staff-roles/staff-roles.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { ApiTokensModule } from './api-tokens/api-tokens.module.js';
import { ClientWebhooksModule } from './client-webhooks/client-webhooks.module.js';
import { ResellerModule } from './reseller/reseller.module.js';
import { EmailMarketingModule } from './email-marketing/email-marketing.module.js';
import { AnalyticsSitesModule } from './analytics-sites/analytics-sites.module.js';
import { MetaCapiModule } from './analytics/meta-capi.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { BetaModule } from './beta/beta.module.js';
import { AbuseModule } from './abuse/abuse.module.js';
import { FontsProxyModule } from './fonts-proxy/fonts-proxy.module.js';
import { BrandModule } from './brand/brand.module.js';
import { KbModule } from './kb/kb.module.js';
import { ControlPlaneMailModule } from './control-plane-mail/control-plane-mail.module.js';
import { VpnModule } from './vpn/vpn.module.js';
import { KsefModule } from './ksef/ksef.module.js';
import { DeliverabilityModule } from './deliverability/deliverability.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [loadConfig],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CryptoModule,
    AuditModule,
    ObjectStorageModule,
    AuthModule,
    ServersModule,
    TelemetryModule,
    NotificationsModule,
    SearchModule,
    BusinessMetricsModule,
    DomainsModule,
    UsersModule,
    TicketsModule,
    BillingModule,
    HealthModule,
    PlansModule,
    SubscriptionsModule,
    AutoscalingModule,
    StatusModule,
    ObservabilityModule,
    MailModule,
    SecurityModule,
    AdminDashboardModule,
    ComplianceModule,
    MarketingModule,
    EmailLogAdminModule,
    ProductOpsModule,
    AiModule,
    PlatformSettingsModule,
    ControlPlaneMailModule,
    VpnModule,
    KsefModule,
    DeliverabilityModule,
    BadgesModule,
    LiveReadinessModule,
    VpsModule,
    PublicStatsModule,
    AddonModule,
    FilesModule,
    StaffRolesModule,
    PartnersModule,
    ApiTokensModule,
    ClientWebhooksModule,
    ResellerModule,
    EmailMarketingModule,
    AnalyticsSitesModule,
    MetaCapiModule,
    LeadsModule,
    BetaModule,
    AbuseModule,
    FontsProxyModule,
    BrandModule,
    KbModule,
  ],
  controllers: [],
  providers: [
    // Audit F-09: global sliding-window rate limit (per-IP). Registered FIRST
    // so abusive traffic is rejected before any auth/db work happens.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CustomerPermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: KontekstZadaniaInterceptor },
  ],
})
export class AppModule {}

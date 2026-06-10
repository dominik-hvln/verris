import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { loadConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';
import { ObjectStorageModule } from './storage/object-storage.module';

import { AuthModule } from './auth/auth.module';
import { ServersModule } from './servers/servers.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { DomainsModule } from './domains/domains.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AutoscalingModule } from './autoscaling/autoscaling.module';
import { StatusModule } from './status/status.module';
import { ObservabilityModule } from './observability/observability.module';
import { MailModule } from './mail/mail.module';
import { SecurityModule } from './security/security.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { ComplianceModule } from './compliance/compliance.module';
import { MarketingModule } from './marketing/marketing.module';
import { EmailLogAdminModule } from './email-log/email-log-admin.module';
import { ProductOpsModule } from './product-ops/product-ops.module';
import { CustomerPermissionsGuard } from './common/guards/customer-permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AiModule } from './ai/ai.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { ControlPlaneMailModule } from './control-plane-mail/control-plane-mail.module';
import { VpnModule } from './vpn/vpn.module';

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
  ],
  controllers: [],
  providers: [
    // Audit F-09: global sliding-window rate limit (per-IP). Registered FIRST
    // so abusive traffic is rejected before any auth/db work happens.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CustomerPermissionsGuard },
  ],
})
export class AppModule {}

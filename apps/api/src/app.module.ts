import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { loadConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './common/audit/audit.module';

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

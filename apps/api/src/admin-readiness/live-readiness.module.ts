import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { MailModule } from '../mail/mail.module';
import { LiveReadinessService } from './live-readiness.service';
import { LiveReadinessAdminController } from './live-readiness.admin.controller';
import { OpsWatchdogScheduler } from './ops-watchdog.scheduler';
import { RblReputationScheduler } from './rbl-reputation.scheduler';

@Module({
  imports: [PlatformSettingsModule, ComplianceModule, MailModule],
  providers: [LiveReadinessService, OpsWatchdogScheduler, RblReputationScheduler],
  controllers: [LiveReadinessAdminController],
})
export class LiveReadinessModule {}

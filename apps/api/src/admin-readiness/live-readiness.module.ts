import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { MailModule } from '../mail/mail.module.js';
import { LiveReadinessService } from './live-readiness.service.js';
import { LiveReadinessAdminController } from './live-readiness.admin.controller.js';
import { OpsWatchdogScheduler } from './ops-watchdog.scheduler.js';
import { RblReputationScheduler } from './rbl-reputation.scheduler.js';
import { MailHealthScheduler } from './mail-health.scheduler.js';
import { ProbaOdtworzeniaScheduler } from './proba-odtworzenia.scheduler.js';

@Module({
  imports: [PlatformSettingsModule, ComplianceModule, MailModule],
  providers: [
    LiveReadinessService,
    OpsWatchdogScheduler,
    RblReputationScheduler,
    MailHealthScheduler,
    ProbaOdtworzeniaScheduler,
  ],
  controllers: [LiveReadinessAdminController],
})
export class LiveReadinessModule {}

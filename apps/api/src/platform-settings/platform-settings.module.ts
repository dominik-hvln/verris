import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { PlatformSettingsAdminController } from './platform-settings.admin.controller.js';
import { PlatformSettingsController } from './platform-settings.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [PlatformSettingsAdminController, PlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}

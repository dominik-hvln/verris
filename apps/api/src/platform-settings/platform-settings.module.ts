import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformSettingsAdminController } from './platform-settings.admin.controller';
import { PlatformSettingsController } from './platform-settings.controller';

@Module({
  imports: [AuditModule],
  controllers: [PlatformSettingsAdminController, PlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}

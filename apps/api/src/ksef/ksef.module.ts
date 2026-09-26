import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { KsefService } from './ksef.service.js';
import { KsefAdminController } from './ksef.admin.controller.js';

/** B-1 — KSeF (Krajowy System e-Faktur): wysyłka faktur ustrukturyzowanych. */
@Module({
  imports: [PlatformSettingsModule],
  controllers: [KsefAdminController],
  providers: [KsefService],
  exports: [KsefService],
})
export class KsefModule {}

import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { KsefService } from './ksef.service';
import { KsefAdminController } from './ksef.admin.controller';

/** B-1 — KSeF (Krajowy System e-Faktur): wysyłka faktur ustrukturyzowanych. */
@Module({
  imports: [PlatformSettingsModule],
  controllers: [KsefAdminController],
  providers: [KsefService],
  exports: [KsefService],
})
export class KsefModule {}

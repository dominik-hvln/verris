import { Module } from '@nestjs/common';
import { ProductOpsAdminController } from './product-ops.admin.controller.js';
import { StatusModule } from '../status/status.module.js';
import { MeFeatureFlagsController } from './me-feature-flags.controller.js';
import { KonfiguracjaMarkiService } from '../kreator-marki/konfiguracja-marki.service.js';

@Module({
  imports: [StatusModule],
  controllers: [ProductOpsAdminController, MeFeatureFlagsController],
  // Paczka 131 – flaga `kreatorMarki` w /me/feature-flags (serwis bez stanu: PlatformSetting + konto; Prisma i audyt globalne).
  providers: [KonfiguracjaMarkiService],
})
export class ProductOpsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MetaCapiService } from './meta-capi.service.js';
import { MetaCapiController } from './meta-capi.controller.js';
import { MetaCapiPublicController } from './meta-capi-public.controller.js';

/** Pomiar server-side (Meta Conversions API). */
@Module({
  imports: [PrismaModule],
  controllers: [MetaCapiController, MetaCapiPublicController],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}

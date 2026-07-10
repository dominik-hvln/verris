import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetaCapiService } from './meta-capi.service';
import { MetaCapiController } from './meta-capi.controller';

/** Pomiar server-side (Meta Conversions API). */
@Module({
  imports: [PrismaModule],
  controllers: [MetaCapiController],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaCapiModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KbService } from './kb.service';
import { KbAdminController } from './kb.admin.controller';
import { KbPublicController } from './kb.public.controller';

/**
 * KB-CMS + KB-PUBLIC — Baza Wiedzy: autoring (admin/staff) + publiczny widok SEO.
 */
@Module({
  imports: [PrismaModule],
  controllers: [KbAdminController, KbPublicController],
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { KbService } from './kb.service.js';
import { KbAdminController } from './kb.admin.controller.js';
import { KbPublicController } from './kb.public.controller.js';

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

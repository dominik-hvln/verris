import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { CaptchaService } from '../auth/captcha.service.js';
import { BetaService } from './beta.service.js';
import { BetaAdminController, MeBetaController } from './beta.controller.js';
import { BetaZgloszeniaService } from './beta-zgloszenia.service.js';
import { BetaZgloszeniaAdminController, BetaZgloszeniaPublicController } from './beta-zgloszenia.controller.js';
import { BetaZgloszeniaRetencjaScheduler } from './beta-zgloszenia-retencja.scheduler.js';

@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [BetaAdminController, MeBetaController, BetaZgloszeniaPublicController, BetaZgloszeniaAdminController],
  // CaptchaService zależy tylko od ConfigService — bez importu całego AuthModule (jak w LeadsModule).
  providers: [BetaService, BetaZgloszeniaService, BetaZgloszeniaRetencjaScheduler, CaptchaService],
})
export class BetaModule {}

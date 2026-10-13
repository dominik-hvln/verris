import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { LeadsService } from './leads.service.js';
import { LeadsPublicController } from './leads-public.controller.js';
import { CaptchaService } from '../auth/captcha.service.js';

/** Leady z verris.pl (formularze LP + kontakt). */
@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [LeadsPublicController],
  // CaptchaService zależy tylko od ConfigService — bez importu całego AuthModule.
  providers: [LeadsService, CaptchaService],
})
export class LeadsModule {}

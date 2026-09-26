import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { AbuseService } from './abuse.service.js';
import { AbusePublicController } from './abuse-public.controller.js';
import { AbuseStaffController } from './abuse-staff.controller.js';

/** N-13 — zgłoszenia nadużyć (DSA art. 16/17). */
@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [AbusePublicController, AbuseStaffController],
  providers: [AbuseService],
})
export class AbuseModule {}

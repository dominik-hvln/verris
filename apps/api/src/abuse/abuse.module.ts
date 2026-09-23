import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../common/audit/audit.module';
import { AbuseService } from './abuse.service';
import { AbusePublicController } from './abuse-public.controller';
import { AbuseStaffController } from './abuse-staff.controller';

/** N-13 — zgłoszenia nadużyć (DSA art. 16/17). */
@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [AbusePublicController, AbuseStaffController],
  providers: [AbuseService],
})
export class AbuseModule {}

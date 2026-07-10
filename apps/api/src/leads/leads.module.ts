import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../common/audit/audit.module';
import { LeadsService } from './leads.service';
import { LeadsPublicController } from './leads-public.controller';

/** Leady z verris.pl (formularze LP + kontakt). */
@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [LeadsPublicController],
  providers: [LeadsService],
})
export class LeadsModule {}

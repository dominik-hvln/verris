import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../common/audit/audit.module';
import { BetaService } from './beta.service';
import { BetaAdminController, MeBetaController } from './beta.controller';

@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [BetaAdminController, MeBetaController],
  providers: [BetaService],
})
export class BetaModule {}

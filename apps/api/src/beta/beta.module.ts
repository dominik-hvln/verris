import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { BetaService } from './beta.service.js';
import { BetaAdminController, MeBetaController } from './beta.controller.js';

@Module({
  imports: [PrismaModule, MailModule, AuditModule],
  controllers: [BetaAdminController, MeBetaController],
  providers: [BetaService],
})
export class BetaModule {}

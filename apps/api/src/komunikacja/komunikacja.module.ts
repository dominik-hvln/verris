import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { MailDoKlientaService } from './mail-do-klienta.service.js';
import { KomunikatySerwisoweService } from './komunikaty-serwisowe.service.js';
import { StatusObslugiService } from './status-obslugi.service.js';
import { KomunikatySerwisoweAdminController, MailDoKlientaAdminController, StatusObslugiAdminController } from './komunikacja.admin.controller.js';

/** F3.8 — komunikacja operacyjna: mail z szablonu, komunikat serwisowy węzła/planu, baner incydentów dla obsługi. */
@Module({
  imports: [AuditModule],
  controllers: [MailDoKlientaAdminController, KomunikatySerwisoweAdminController, StatusObslugiAdminController],
  providers: [MailDoKlientaService, KomunikatySerwisoweService, StatusObslugiService],
  exports: [StatusObslugiService],
})
export class KomunikacjaModule {}

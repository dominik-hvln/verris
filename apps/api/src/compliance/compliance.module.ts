import { Module } from '@nestjs/common';
import { LegalDocumentsService } from './legal-documents.service.js';
import { LegalDocumentsController } from './legal-documents.controller.js';
import { ConsentsService } from './consents.service.js';
import { MarketingPreferencesService } from './marketing-preferences.service.js';
import { ConsentsController } from './consents.controller.js';
import { DataExportService } from './data-export.service.js';
import { DataExportController } from './data-export.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionScheduler } from './account-deletion.scheduler.js';
import { RetentionScheduler } from './retention.scheduler.js';
import { ComplianceAdminController } from './compliance.admin.controller.js';
import { DpaPdfService } from './dpa-pdf.service.js';
import { DpaController } from './dpa.controller.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ServersModule } from '../servers/servers.module.js';

@Module({
  imports: [AuditModule, MailModule, ServersModule],
  providers: [
    LegalDocumentsService,
    ConsentsService,
    MarketingPreferencesService,
    DataExportService,
    AccountDeletionService,
    AccountDeletionScheduler,
    RetentionScheduler,
    DpaPdfService,
  ],
  controllers: [
    LegalDocumentsController,
    ConsentsController,
    DataExportController,
    AccountDeletionController,
    ComplianceAdminController,
    DpaController,
  ],
  exports: [
    LegalDocumentsService,
    ConsentsService,
    MarketingPreferencesService,
    DataExportService,
    AccountDeletionService,
    DpaPdfService,
  ],
})
export class ComplianceModule {}

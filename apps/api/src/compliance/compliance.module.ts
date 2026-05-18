import { Module } from '@nestjs/common';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalDocumentsController } from './legal-documents.controller';
import { ConsentsService } from './consents.service';
import { MarketingPreferencesService } from './marketing-preferences.service';
import { ConsentsController } from './consents.controller';
import { DataExportService } from './data-export.service';
import { DataExportController } from './data-export.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionScheduler } from './account-deletion.scheduler';
import { RetentionScheduler } from './retention.scheduler';
import { ComplianceAdminController } from './compliance.admin.controller';
import { DpaPdfService } from './dpa-pdf.service';
import { DpaController } from './dpa.controller';
import { AuditModule } from '../common/audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { ServersModule } from '../servers/servers.module';

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

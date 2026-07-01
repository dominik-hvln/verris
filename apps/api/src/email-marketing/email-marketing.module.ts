import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { EmailMarketingService } from './email-marketing.service';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { EmailMarketingDispatcher } from './email-marketing.dispatcher';

/**
 * EMM — produkt email-marketingu (listy/kontakty/kampanie/wysyłka). Mailer i
 * Prisma są globalne; potrzebujemy tylko AuditModule. Kontrolery: klient
 * (JWT, account-scoped) + publiczny (confirm/unsubscribe). Dispatcher wysyła
 * kampanie batchami w cronie.
 */
@Module({
  imports: [AuditModule],
  controllers: [EmailMarketingController, EmailMarketingPublicController],
  providers: [EmailMarketingService, EmailMarketingDispatcher],
  exports: [EmailMarketingService],
})
export class EmailMarketingModule {}

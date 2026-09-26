import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { EmailMarketingService } from './email-marketing.service.js';
import { EmailMarketingController } from './email-marketing.controller.js';
import { EmailMarketingPublicController } from './email-marketing-public.controller.js';
import { EmailMarketingDispatcher } from './email-marketing.dispatcher.js';
import { DeliverabilityModule } from '../deliverability/deliverability.module.js';

/**
 * EMM — produkt email-marketingu (listy/kontakty/kampanie/wysyłka). Mailer i
 * Prisma są globalne; potrzebujemy AuditModule + DeliverabilityModule
 * (OutboundAbuseGuard — CYBER-3). Kontrolery: klient (JWT, account-scoped) +
 * publiczny (confirm/unsubscribe). Dispatcher wysyła kampanie batchami w cronie.
 */
@Module({
  imports: [AuditModule, DeliverabilityModule],
  controllers: [EmailMarketingController, EmailMarketingPublicController],
  providers: [EmailMarketingService, EmailMarketingDispatcher],
  exports: [EmailMarketingService],
})
export class EmailMarketingModule {}

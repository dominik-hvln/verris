import { Module } from '@nestjs/common';
import { OutboundAbuseGuard } from './outbound-abuse.guard.js';
import { OutboundCordonAdminController } from './outbound-cordon.admin.controller.js';

/**
 * CYBER-3 — deliverability / ochrona wysyłki. Dostarcza OutboundAbuseGuard
 * (limity + auto-cordon per konto) oraz panel admina do przeglądu/zwolnienia
 * cordonów. AuditService, MailerService i ConfigService są globalne.
 */
@Module({
  controllers: [OutboundCordonAdminController],
  providers: [OutboundAbuseGuard],
  exports: [OutboundAbuseGuard],
})
export class DeliverabilityModule {}

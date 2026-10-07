import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller.js';
import { DomainsService } from './domains.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { CryptoModule } from '../common/crypto/crypto.module.js';
import { DomainExpiryReminderScheduler } from './domain-expiry-reminder.scheduler.js';
import { DomainRegistrarService } from './domain-registrar.service.js';
import { NbpFxService } from './nbp-fx.service.js';
import { RegistrarProviderFactory } from './registrar.provider.js';
import { OpenproviderWebhookController } from './openprovider-webhook.controller.js';
import { RegistrarAdminController } from './registrar.admin.controller.js';
import { BillingModule } from '../billing/billing.module.js';
import { EcoModule } from '../eco/eco.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';

@Module({
  imports: [PrismaModule, ConfigModule, CryptoModule, BillingModule, EcoModule, PlatformSettingsModule],
  controllers: [DomainsController, OpenproviderWebhookController, RegistrarAdminController],
  providers: [DomainsService, DomainRegistrarService, RegistrarProviderFactory, NbpFxService, DomainExpiryReminderScheduler],
  // G-08 — SslModule korzysta z tego samego klienta rejestratora i kursów NBP (jeden harmonogram kursów).
  exports: [RegistrarProviderFactory, NbpFxService],
})
export class DomainsModule {}

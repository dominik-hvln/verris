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
import { BillingModule } from '../billing/billing.module.js';
import { EcoModule } from '../eco/eco.module.js';

@Module({
  imports: [PrismaModule, ConfigModule, CryptoModule, BillingModule, EcoModule],
  controllers: [DomainsController],
  providers: [DomainsService, DomainRegistrarService, RegistrarProviderFactory, NbpFxService, DomainExpiryReminderScheduler],
})
export class DomainsModule {}

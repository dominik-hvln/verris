import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { CryptoModule } from '../common/crypto/crypto.module';
import { DomainRegistrarService } from './domain-registrar.service';
import { NbpFxService } from './nbp-fx.service';
import { RegistrarProviderFactory } from './registrar.provider';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, ConfigModule, CryptoModule, BillingModule],
  controllers: [DomainsController],
  providers: [DomainsService, DomainRegistrarService, RegistrarProviderFactory, NbpFxService],
})
export class DomainsModule {}

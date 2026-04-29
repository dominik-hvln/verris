import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingAdminController } from './billing.admin.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { StripeService } from './stripe/stripe.service';
import { StripeWebhookController } from './stripe/stripe.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PromoService } from './promo.service';
import { WalletAutoTopupService } from './wallet-auto-topup.service';
import { WalletAutoTopupScheduler } from './wallet-auto-topup.scheduler';

@Module({
  imports: [forwardRef(() => SubscriptionsModule)],
  controllers: [
    BillingController,
    BillingAdminController,
    StripeWebhookController,
    InvoicesController,
  ],
  providers: [
    BillingService,
    WalletLedgerService,
    StripeService,
    InvoicesService,
    PromoService,
    WalletAutoTopupService,
    WalletAutoTopupScheduler,
  ],
  exports: [BillingService, WalletLedgerService, StripeService, InvoicesService, PromoService, WalletAutoTopupService],
})
export class BillingModule {}

import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingAdminController } from './billing.admin.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { StripeService } from './stripe/stripe.service';
import { StripeWebhookController } from './stripe/stripe.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesAdminController } from './invoices.admin.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PromoService } from './promo.service';
import { WalletAutoTopupService } from './wallet-auto-topup.service';
import { WalletAutoTopupScheduler } from './wallet-auto-topup.scheduler';
import { WalletLowBalanceScheduler } from './wallet-low-balance.scheduler';
import { MailModule } from '../mail/mail.module';
import { EcoModule } from '../eco/eco.module';

@Module({
  imports: [forwardRef(() => SubscriptionsModule), MailModule, EcoModule],
  controllers: [
    BillingController,
    BillingAdminController,
    StripeWebhookController,
    InvoicesController,
    InvoicesAdminController,
  ],
  providers: [
    BillingService,
    WalletLedgerService,
    StripeService,
    InvoicesService,
    InvoicePdfService,
    PromoService,
    WalletAutoTopupService,
    WalletAutoTopupScheduler,
    WalletLowBalanceScheduler,
  ],
  exports: [BillingService, WalletLedgerService, StripeService, InvoicesService, PromoService, WalletAutoTopupService],
})
export class BillingModule {}

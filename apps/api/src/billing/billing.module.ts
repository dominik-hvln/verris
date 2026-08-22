import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingAdminController } from './billing.admin.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { StripeService } from './stripe/stripe.service';
import { StripeWebhookController } from './stripe/stripe.controller';
import { StripeWebhookEventsAdminController } from './stripe/stripe-webhook-events.admin.controller';
import { StripeWebhookPonowieniaScheduler } from './stripe/stripe-webhook-ponowienia.scheduler';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesAdminController } from './invoices.admin.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PromoService } from './promo.service';
import { WalletAutoTopupService } from './wallet-auto-topup.service';
import { WalletAutoTopupScheduler } from './wallet-auto-topup.scheduler';
import { WalletLowBalanceScheduler } from './wallet-low-balance.scheduler';
import { SlaCreditScheduler } from './sla-credit.scheduler';
import { FakturyScheduler } from './faktury.scheduler';
import { MailModule } from '../mail/mail.module';
import { KsefModule } from '../ksef/ksef.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { EcoModule } from '../eco/eco.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => SubscriptionsModule), MailModule, EcoModule, KsefModule, PlatformSettingsModule, NotificationsModule],
  controllers: [
    BillingController,
    BillingAdminController,
    StripeWebhookController,
    StripeWebhookEventsAdminController,
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
    SlaCreditScheduler,
    StripeWebhookPonowieniaScheduler,
    FakturyScheduler,
  ],
  exports: [BillingService, WalletLedgerService, StripeService, InvoicesService, PromoService, WalletAutoTopupService],
})
export class BillingModule {}

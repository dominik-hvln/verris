import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { BillingController } from './billing.controller.js';
import { BillingAdminController } from './billing.admin.controller.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { StripeService } from './stripe/stripe.service.js';
import { AnulowanieService } from './anulowanie.service.js';
import { StripeWebhookController } from './stripe/stripe.controller.js';
import { StripeWebhookEventsAdminController } from './stripe/stripe-webhook-events.admin.controller.js';
import { StripeWebhookPonowieniaScheduler } from './stripe/stripe-webhook-ponowienia.scheduler.js';
import { InvoicesService } from './invoices.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesAdminController } from './invoices.admin.controller.js';
import { ProformaService } from './proforma.service.js';
import { DoladowanieService } from './doladowanie.service.js';
import { ViesService } from './vies.service.js';
import { VatNabywcyService } from './vat-nabywcy.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { PromoService } from './promo.service.js';
import { WalletAutoTopupService } from './wallet-auto-topup.service.js';
import { WalletAutoTopupScheduler } from './wallet-auto-topup.scheduler.js';
import { WalletLowBalanceScheduler } from './wallet-low-balance.scheduler.js';
import { SlaCreditScheduler } from './sla-credit.scheduler.js';
import { SlaAdminController } from './sla.admin.controller.js';
import { FakturyScheduler } from './faktury.scheduler.js';
import { KorektyService } from './korekty.service.js';
import { FakturyZewnetrzneService } from './faktury-zewnetrzne.service.js';
import { MailModule } from '../mail/mail.module.js';
import { KsefModule } from '../ksef/ksef.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { EcoModule } from '../eco/eco.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [forwardRef(() => SubscriptionsModule), MailModule, EcoModule, KsefModule, PlatformSettingsModule, NotificationsModule],
  controllers: [
    SlaAdminController,
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
    AnulowanieService,
    InvoicesService,
    InvoicePdfService,
    ProformaService,
    DoladowanieService,
    ViesService,
    VatNabywcyService,
    PromoService,
    WalletAutoTopupService,
    WalletAutoTopupScheduler,
    WalletLowBalanceScheduler,
    SlaCreditScheduler,
    StripeWebhookPonowieniaScheduler,
    FakturyScheduler,
    KorektyService,
    FakturyZewnetrzneService,
  ],
  exports: [BillingService, VatNabywcyService, WalletLedgerService, StripeService, InvoicesService, PromoService, WalletAutoTopupService, KorektyService],
})
export class BillingModule {}

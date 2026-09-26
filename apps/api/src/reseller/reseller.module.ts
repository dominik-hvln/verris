import { Module } from '@nestjs/common';
import { ResellerService } from './reseller.service.js';
import { ResellerKlienciService } from './reseller-klienci.service.js';
import { ResellerController } from './reseller.controller.js';
import { PartnerKlientaController } from './partner-klienta.controller.js';
import { ResellerAdminController } from './reseller.admin.controller.js';
import { ResellerLogoPublicController } from './reseller-logo.public.controller.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ResellerPrzypomnienieScheduler } from './reseller-przypomnienie.scheduler.js';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  providers: [ResellerService, ResellerKlienciService, ResellerPrzypomnienieScheduler],
  controllers: [ResellerController, ResellerAdminController, PartnerKlientaController, ResellerLogoPublicController],
  exports: [ResellerService],
})
export class ResellerModule {}

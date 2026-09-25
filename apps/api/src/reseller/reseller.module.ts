import { Module } from '@nestjs/common';
import { ResellerService } from './reseller.service';
import { ResellerKlienciService } from './reseller-klienci.service';
import { ResellerController } from './reseller.controller';
import { PartnerKlientaController } from './partner-klienta.controller';
import { ResellerAdminController } from './reseller.admin.controller';
import { ResellerLogoPublicController } from './reseller-logo.public.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResellerPrzypomnienieScheduler } from './reseller-przypomnienie.scheduler';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  providers: [ResellerService, ResellerKlienciService, ResellerPrzypomnienieScheduler],
  controllers: [ResellerController, ResellerAdminController, PartnerKlientaController, ResellerLogoPublicController],
  exports: [ResellerService],
})
export class ResellerModule {}

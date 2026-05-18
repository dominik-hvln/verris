import { Module } from '@nestjs/common';
import { MarketingAdminController } from './marketing.admin.controller';
import { MarketingCampaignService } from './marketing-campaign.service';
import { MarketingCampaignDispatcher } from './marketing-campaign.dispatcher';
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MarketingAdminController],
  providers: [MarketingCampaignService, MarketingCampaignDispatcher],
  exports: [MarketingCampaignService],
})
export class MarketingModule {}

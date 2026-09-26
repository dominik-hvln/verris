import { Module } from '@nestjs/common';
import { MarketingAdminController } from './marketing.admin.controller.js';
import { MarketingCampaignService } from './marketing-campaign.service.js';
import { MarketingCampaignDispatcher } from './marketing-campaign.dispatcher.js';
import { AuditModule } from '../common/audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [MarketingAdminController],
  providers: [MarketingCampaignService, MarketingCampaignDispatcher],
  exports: [MarketingCampaignService],
})
export class MarketingModule {}

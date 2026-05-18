import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketingCampaignStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingCampaignService } from './marketing-campaign.service';

/**
 * Sprint 2.6 — cron, który puszcza zaplanowane kampanie.
 *
 * Strategia:
 *   - co 60s patrzymy, czy mamy SCHEDULED z `scheduledAt <= now()`. Jeśli
 *     tak — przenosimy do SENDING (i ustawiamy `recipientCount`).
 *   - co 60s też wysyłamy KOLEJNĄ paczkę z istniejących SENDING (max 1
 *     kampania równocześnie — żeby nie zatkać Postfixa). Po wyczerpaniu
 *     segmentu kampania wskakuje na SENT.
 *
 * Ograniczenie 1-na-raz dobre na ~5k usera; gdy będziemy mieć skalę 50k+
 * podzielimy worker na wiele równoległych z lockami advisory na campaignId.
 */
@Injectable()
export class MarketingCampaignDispatcher {
  private readonly logger = new Logger(MarketingCampaignDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: MarketingCampaignService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.promoteScheduled();
      await this.flushSending();
    } catch (err) {
      this.logger.error(
        `Marketing dispatcher tick failed: ${(err as Error).message}`,
      );
    }
  }

  private async promoteScheduled(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.marketingCampaign.findFirst({
      where: {
        status: MarketingCampaignStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true },
    });
    if (!due) return;
    await this.campaigns.startSending(due.id);
    this.logger.log(`Campaign ${due.id} promoted SCHEDULED→SENDING.`);
  }

  private async flushSending(): Promise<void> {
    const sending = await this.prisma.marketingCampaign.findFirst({
      where: { status: MarketingCampaignStatus.SENDING },
      orderBy: { startedAt: 'asc' },
      select: { id: true },
    });
    if (!sending) return;
    const result = await this.campaigns.sendNextBatch(sending.id);
    if (!result.done) {
      this.logger.debug(
        `Campaign ${sending.id} batch processed=${result.processed}.`,
      );
    }
  }
}

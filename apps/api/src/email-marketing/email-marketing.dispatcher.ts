import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailMarketingService } from './email-marketing.service';

/**
 * EMM — dispatcher kampanii. Co minutę bierze kampanie w stanie SENDING i
 * wysyła kolejne paczki odbiorców (idempotentnie, batchami). Pojedynczy bieg
 * przetwarza maks. kilka batchy per kampania, by nie blokować event-loopa —
 * reszta zostaje na następną minutę.
 */
@Injectable()
export class EmailMarketingDispatcher {
  private readonly logger = new Logger(EmailMarketingDispatcher.name);
  private busy = false;
  private static readonly MAX_BATCHES_PER_RUN = 5;

  constructor(private readonly emm: EmailMarketingService) {}

  @Cron('* * * * *', { name: 'emm-campaign-dispatch' })
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const sending = await this.emm.findSending(20);
      for (const c of sending) {
        for (let i = 0; i < EmailMarketingDispatcher.MAX_BATCHES_PER_RUN; i++) {
          const res = await this.emm.sendNextBatch(c.id);
          if (res.done || res.processed === 0) break;
        }
      }
    } catch (err) {
      this.logger.error(`EMM dispatch failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HostingRestoreService } from './hosting-restore.service';

/**
 * Drains queued hosting-restore jobs. Runs at most one restore at a time
 * (restores are heavy and overwrite live data); a busy guard prevents
 * overlapping ticks. Processes up to a few queued jobs per minute.
 */
@Injectable()
export class HostingRestoreScheduler {
  private readonly logger = new Logger(HostingRestoreScheduler.name);
  private busy = false;

  constructor(private readonly restore: HostingRestoreService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'hosting-restore-worker' })
  async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let processed = 0;
      // Cap per tick so a backlog can't monopolize the worker forever.
      while (processed < 5 && (await this.restore.processNextQueued())) {
        processed += 1;
      }
      if (processed > 0) {
        this.logger.log(`Przetworzono ${processed} zadań przywracania.`);
      }
    } catch (err) {
      this.logger.error(`Restore worker error: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

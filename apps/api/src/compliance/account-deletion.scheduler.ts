import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountDeletionService } from './account-deletion.service';

/**
 * GDPR Art. 17 schedulers.
 *
 * Two independent cron jobs share this class:
 *
 *   1. **Anonymization** (`runAnonymization` @ 03:30 daily) — picks up users
 *      whose 14-day grace period has elapsed and runs `executeAnonymization`.
 *      Side-effects per user: DB anonymization + DA suspend + final email.
 *
 *   2. **DA hard-purge** (`runDaPurge` @ 04:15 daily) — picks up Account rows
 *      whose owner has been anonymized for >30 days and runs DirectAdmin
 *      `delete=yes` to remove home directory, databases, mail, etc. Account
 *      row in DB is marked `status = DELETED`.
 *
 * Each tick processes up to 50 rows to bound runtime; backlog clears on next
 * tick. Per-row errors are logged but do NOT abort the batch.
 */
@Injectable()
export class AccountDeletionScheduler {
  private readonly logger = new Logger(AccountDeletionScheduler.name);

  constructor(private readonly service: AccountDeletionService) {}

  @Cron('30 3 * * *')
  async runAnonymization(): Promise<void> {
    const due = await this.service.listDue();
    if (due.length === 0) return;
    this.logger.log(`AccountDeletionScheduler: anonymizing ${due.length} due account(s)`);

    for (const userId of due) {
      try {
        await this.service.executeAnonymization(userId, null);
      } catch (err) {
        this.logger.error(
          `Anonymization failed for userId=${userId}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }

  @Cron('15 4 * * *')
  async runDaPurge(): Promise<void> {
    const due = await this.service.listAccountsDueForDaPurge();
    if (due.length === 0) return;
    this.logger.log(
      `AccountDeletionScheduler: hard-purging ${due.length} DA account(s) on hosting servers`,
    );

    for (const accountId of due) {
      try {
        await this.service.purgeAccountOnDa(accountId);
      } catch (err) {
        this.logger.error(
          `DA purge failed for accountId=${accountId}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }
}

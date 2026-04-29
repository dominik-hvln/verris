import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WalletAutoTopupService } from './wallet-auto-topup.service';

/** C-9 — periodic eligibility check (~10× / h); actual charge settles via Stripe webhook too. */
@Injectable()
export class WalletAutoTopupScheduler {
  private readonly logger = new Logger(WalletAutoTopupScheduler.name);

  constructor(private readonly svc: WalletAutoTopupService) {}

  @Cron('0 */10 * * * *')
  async tick() {
    try {
      await this.svc.runEligibleChecks();
    } catch (err) {
      this.logger.warn(`auto-topup batch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AsystentWwwService } from './asystent-www.service.js';

/** Retencja rozmów asystenta www: raz na dobę usuwa rozmowy bez wiadomości od 30 dni (RODO — minimalizacja). */
@Injectable()
export class AsystentRetencjaScheduler {
  private readonly logger = new Logger(AsystentRetencjaScheduler.name);
  private busy = false;

  constructor(private readonly asystent: AsystentWwwService) {}

  @Cron('40 3 * * *', { name: 'asystent-www-retencja' })
  async usun(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.asystent.usunStare();
      if (n) this.logger.log(`asystent www: usunięto ${n} rozmów starszych niż 30 dni`);
    } catch (err) {
      this.logger.error(`asystent www: retencja nie powiodła się: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

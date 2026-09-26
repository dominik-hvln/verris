import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WpUpdateService } from './wp-update.service.js';

/**
 * I-04 — raz na dobę, w nocy (mały ruch na stronach klientów), zleca automatyczne aktualizacje
 * WordPressa według ustawień klientów. Każda idzie z kopią i wycofaniem (node-wp-update.sh).
 * Konto zajęte innym zadaniem WP czeka do następnej nocy.
 */
@Injectable()
export class WpAutoUpdateScheduler {
  private readonly logger = new Logger(WpAutoUpdateScheduler.name);

  constructor(private readonly wp: WpUpdateService) {}

  @Cron('20 3 * * *', { name: 'wp-auto-update', timeZone: 'Europe/Warsaw' })
  async run(): Promise<void> {
    try {
      const n = await this.wp.zlecAutomatyczne();
      if (n > 0) this.logger.log(`Zlecono ${n} automatycznych aktualizacji WordPressa.`);
    } catch (err) {
      this.logger.error(`WP auto-update: ${(err as Error).message}`);
    }
  }
}

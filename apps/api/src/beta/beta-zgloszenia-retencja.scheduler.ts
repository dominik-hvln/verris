import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BetaZgloszeniaService } from './beta-zgloszenia.service.js';

/** Retencja zgłoszeń do otwartej bety: raz na dobę (RODO — minimalizacja; okresy w BetaZgloszeniaService). */
@Injectable()
export class BetaZgloszeniaRetencjaScheduler {
  private readonly logger = new Logger(BetaZgloszeniaRetencjaScheduler.name);
  private busy = false;

  constructor(private readonly zgloszenia: BetaZgloszeniaService) {}

  @Cron('50 3 * * *', { name: 'beta-zgloszenia-retencja' })
  async usun(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.zgloszenia.usunStare();
      if (n) this.logger.log(`zgłoszenia do bety: usunięto ${n} po okresie przechowywania`);
    } catch (err) {
      this.logger.error(`zgłoszenia do bety: retencja nie powiodła się: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

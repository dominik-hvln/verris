import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsService } from './leads.service.js';

/** A2-02 — retencja danych z formularzy verris.pl raz na dobę (okresy w leads-retencja.ts). */
@Injectable()
export class LeadsRetencjaScheduler {
  private readonly logger = new Logger(LeadsRetencjaScheduler.name);
  private busy = false;

  constructor(private readonly leads: LeadsService) {}

  @Cron('45 3 * * *', { name: 'leads-retencja' })
  async usun(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.leads.usunStare();
      if (n) this.logger.log(`formularze www: usunięto ${n} po okresie przechowywania`);
    } catch (err) {
      this.logger.error(`formularze www: retencja nie powiodła się: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

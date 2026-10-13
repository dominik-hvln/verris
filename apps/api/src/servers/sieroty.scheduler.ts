import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NodeTasksService } from './node-tasks.service.js';

/**
 * H-16 (decyzja Dominika 14.10) — konto-sierota po przeniesieniu na inny węzeł jest zawieszone dobę (okno na wycofanie),
 * potem usuwane, o ile konto działa na nowym węźle. Co godzinę, o 17 minucie.
 */
@Injectable()
export class SierotyScheduler {
  private readonly logger = new Logger(SierotyScheduler.name);

  constructor(private readonly tasks: NodeTasksService) {}

  @Cron('17 * * * *', { name: 'wezly:sieroty-po-przeniesieniu' })
  async uruchom(): Promise<number> {
    try {
      const n = await this.tasks.sprzatnijSieroty();
      if (n) this.logger.log(`Usunięto ${n} kont-sierot po przeniesieniu.`);
      return n;
    } catch (e) {
      this.logger.warn(`Sprzątanie sierot: ${(e as Error).message}`);
      return 0;
    }
  }
}

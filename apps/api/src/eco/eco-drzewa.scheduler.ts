import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EcoDrzewaService } from './eco-drzewa.service.js';

/**
 * W6 — sadzenie drzew z puli i własnych drzew klientów: co godzinę (minuta 23). Przebieg nic nie robi, gdy sadzenie
 * jest wyłączone, brakuje ID sadzenia albo tokenu, albo kredytów API. Wielu instancji pilnują: atomowe zajęcie
 * zamówienia (OCZEKUJE → WYSYLANE) i blokada doradcza przy tworzeniu drzew z puli.
 */
@Injectable()
export class EcoDrzewaScheduler {
  private readonly logger = new Logger(EcoDrzewaScheduler.name);
  private busy = false;

  constructor(private readonly drzewa: EcoDrzewaService) {}

  @Cron('23 * * * *', { name: 'eko-sadzenie-drzew' })
  async sadz(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.drzewa.przebieg();
      if (r.wyslane || r.bledy.length) {
        this.logger.log(`sadzenie drzew: wysłane ${r.wyslane}, posadzone ${r.posadzone}, błędy ${r.bledy.length}`);
      }
      for (const b of r.bledy) this.logger.warn(`sadzenie drzew: ${b}`);
    } catch (err) {
      this.logger.error(`sadzenie drzew: przebieg nie powiódł się: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}

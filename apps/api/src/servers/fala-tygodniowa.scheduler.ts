import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NodeTasksService } from './node-tasks.service';

/**
 * PB-35 — cotygodniowa fala aktualizacji floty (decyzja właściciela 26.09): wtorek 4:00 czasu
 * polskiego. Węzły same niczego nie instalują (dnf-automatic tylko pobiera), więc bez tej fali
 * poprawki bezpieczeństwa czekałyby na ręczne uruchomienie. Fala: kanarek → reszta po jednym,
 * błąd zatrzymuje i powiadamia adminów (NodeTasksService.dalejFala).
 */
@Injectable()
export class FalaTygodniowaScheduler {
  private readonly logger = new Logger(FalaTygodniowaScheduler.name);

  constructor(private readonly tasks: NodeTasksService) {}

  @Cron('0 4 * * 2', { name: 'wezly:fala-tygodniowa', timeZone: 'Europe/Warsaw' })
  async uruchom(): Promise<'start' | 'trwa' | 'brak'> {
    try {
      const r = await this.tasks.queueFleetUpdate(null);
      this.logger.log(r.kanarek ? `Fala tygodniowa ruszyła od węzła ${r.kanarek}` : 'Fala tygodniowa: brak węzłów z agentem');
      return r.kanarek ? 'start' : 'brak';
    } catch (e) {
      // Fala już trwa (np. uruchomiona ręcznie) — nie dublujemy.
      this.logger.warn(`Fala tygodniowa pominięta: ${(e as Error).message}`);
      return 'trwa';
    }
  }
}

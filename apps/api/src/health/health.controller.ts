import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isDraining } from './lifecycle.js';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness probe — true as long as the event loop responds. */
  @Get('healthz')
  liveness() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /**
   * Readiness probe — używany przez reverse-proxy do decyzji o kierowaniu ruchu.
   * Zwraca 503, gdy: (a) trwa drain (SIGTERM przy wdrożeniu) lub (b) baza jest
   * niedostępna. Caddy z aktywnym health-check zdejmuje wtedy ten upstream.
   */
  @Get('readyz')
  async readiness() {
    if (isDraining()) {
      throw new ServiceUnavailableException({ status: 'draining', database: 'unknown' });
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (err) {
      // Treść błędu tylko w logu: /readyz jest publiczne (sonda strony statusu), a komunikat bazy
      // zawiera adres i port serwera danych (07.10).
      this.logger.warn(`readyz: baza niedostępna — ${err instanceof Error ? err.message : 'unknown'}`);
      throw new ServiceUnavailableException({ status: 'degraded', database: 'down' });
    }
  }
}

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isDraining } from './lifecycle';

@Controller()
export class HealthController {
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
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'down',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}

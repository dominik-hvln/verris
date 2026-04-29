import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness probe — true as long as the event loop responds. */
  @Get('healthz')
  liveness() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness probe — verifies DB connectivity. */
  @Get('readyz')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (err) {
      return {
        status: 'degraded',
        database: 'down',
        error: err instanceof Error ? err.message : 'unknown',
      };
    }
  }
}

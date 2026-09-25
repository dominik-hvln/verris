import { Controller, Get, Header, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service';

/**
 * F-13: `GET /metrics` — exposed for Prometheus scraping. Authentication is
 * intentionally simple: a shared bearer token from `METRICS_AUTH_TOKEN`. If
 * the env var is empty, the endpoint is open ONLY outside production (dev/CI);
 * in production an empty token closes it.
 *
 * The dedicated guard avoids polluting Prometheus scrapes with our JWT
 * machinery and the audit log.
 */
@Controller('metrics')
export class MetricsController {
  private readonly token = process.env.METRICS_AUTH_TOKEN ?? '';

  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(@Headers('authorization') authHeader?: string): Promise<string> {
    // Produkcja bez tokenu = zamknięte (fail-closed): pominięta zmienna nie może wystawić metryk
    // biznesowych na publicznym adresie API. Porównanie w stałym czasie.
    if (!this.token) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Metrics token is not configured');
    } else {
      const oczekiwany = Buffer.from(`Bearer ${this.token}`);
      const podany = Buffer.from(authHeader ?? '');
      if (podany.length !== oczekiwany.length || !timingSafeEqual(podany, oczekiwany)) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }
    return this.metrics.getPrometheusMetrics();
  }
}

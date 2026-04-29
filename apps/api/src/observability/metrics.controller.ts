import { Controller, Get, Header, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * F-13: `GET /metrics` — exposed for Prometheus scraping. Authentication is
 * intentionally simple: a shared bearer token from `METRICS_AUTH_TOKEN`. If
 * the env var is empty, the endpoint is fully open (suitable when Prometheus
 * runs on the same private docker network and Caddy never proxies it
 * publicly).
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
    if (this.token.length > 0) {
      const expected = `Bearer ${this.token}`;
      if (authHeader !== expected) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }
    return this.metrics.getPrometheusMetrics();
  }
}

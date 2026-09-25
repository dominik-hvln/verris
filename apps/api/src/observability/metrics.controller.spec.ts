import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

/** F-13 — /metrics: token w stałym czasie; produkcja bez tokenu jest zamknięta. */
describe('MetricsController', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const kontroler = () => new MetricsController({ getPrometheusMetrics: jest.fn(async () => 'm 1') } as never);

  it('z tokenem: poprawny nagłówek → metryki, zły albo brak → 401', async () => {
    process.env.METRICS_AUTH_TOKEN = 'tajny';
    const c = kontroler();
    await expect(c.scrape('Bearer tajny')).resolves.toBe('m 1');
    await expect(c.scrape('Bearer zly')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.scrape(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bez tokenu: produkcja → 401, poza produkcją otwarte', async () => {
    process.env.METRICS_AUTH_TOKEN = '';
    process.env.NODE_ENV = 'production';
    await expect(kontroler().scrape(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    process.env.NODE_ENV = 'test';
    await expect(kontroler().scrape(undefined)).resolves.toBe('m 1');
  });
});

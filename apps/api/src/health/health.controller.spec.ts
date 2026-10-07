import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** 07.10 — /readyz jest publiczne (sonda strony statusu); przy awarii bazy zwracało treść błędu z adresem serwera. */
describe('/readyz', () => {
  it('baza działa → ok', async () => {
    const c = new HealthController({ $queryRaw: vi.fn().mockResolvedValue([1]) } as never);
    await expect(c.readiness()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('baza nie działa → 503 bez treści błędu bazy', async () => {
    const c = new HealthController({ $queryRaw: vi.fn().mockRejectedValue(new Error("Can't reach database server at `10.0.0.5:5432`")) } as never);
    const e = await c.readiness().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((e as ServiceUnavailableException).getResponse())).not.toContain('10.0.0.5');
    expect((e as ServiceUnavailableException).getResponse()).toEqual({ status: 'degraded', database: 'down' });
  });
});

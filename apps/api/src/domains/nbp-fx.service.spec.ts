import { NbpFxService } from './nbp-fx.service';

describe('NbpFxService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function service(env: Record<string, string> = {}) {
    const config = {
      get: (key: string) =>
        ({
          DOMAIN_FX_NBP_ENABLED: 'true',
          DOMAIN_FX_USD_PLN: '3.65',
          DOMAIN_FX_EUR_PLN: '4.32',
          ...env,
        })[key],
    };
    return new NbpFxService(config as never);
  }

  it('fetches USD/EUR mid rates from NBP table A', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          table: 'A',
          no: '062/A/NBP/2026',
          effectiveDate: '2026-06-10',
          rates: [
            { code: 'USD', mid: 3.7012 },
            { code: 'EUR', mid: 4.2891 },
          ],
        },
      ],
    }) as never;

    const rates = await service().getRates();
    expect(rates.source).toBe('nbp');
    expect(rates.usdPln).toBe(3.7012);
    expect(rates.eurPln).toBe(4.2891);
    expect(rates.nbpEffectiveDate).toBe('2026-06-10');
  });

  it('falls back to env when NBP is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const rates = await service().getRates();
    expect(rates.source).toBe('env');
    expect(rates.usdPln).toBe(3.65);
    expect(rates.eurPln).toBe(4.32);
  });

  it('uses env when NBP disabled', async () => {
    global.fetch = jest.fn() as never;
    const rates = await service({ DOMAIN_FX_NBP_ENABLED: 'false' }).getRates();
    expect(rates.source).toBe('env');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

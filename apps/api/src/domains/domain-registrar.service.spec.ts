import { ServiceUnavailableException } from '@nestjs/common';
import { DomainRegistrarService } from './domain-registrar.service.js';

describe('DomainRegistrarService', () => {
  const prisma = {};
  const audit = { record: vi.fn() };
  const crypto = { encrypt: vi.fn((v: string) => `enc:${v}`) };
  const wallet = { debit: vi.fn(), credit: vi.fn() };
  const config = { get: vi.fn(() => '1.0') };
  const nbpFx = {
    getRates: vi.fn().mockResolvedValue({
      usdPln: 3.65,
      eurPln: 4.32,
      source: 'env',
      nbpTableNo: null,
      nbpEffectiveDate: null,
      fetchedAt: new Date().toISOString(),
    }),
  };
  const ecoPoints = { safeAward: vi.fn(), awardDomainFirstPaid: vi.fn(), awardDomainRenewal: vi.fn() };

  beforeEach(() => vi.clearAllMocks());

  it('orders(): lastError dla klienta jest oczyszczony z surowego tekstu rejestratora/serwera', async () => {
    const wiersz = (lastError: string | null) => ({ id: 'o1', domainName: 'a.pl', lastError });
    const prismaZ = {
      domainRegistrarOrder: {
        findMany: vi.fn().mockResolvedValue([
          wiersz('EPP 2400 DirectAdmin CMD_API_X failed at 10.0.0.5:2222'),
          wiersz('Rejestr odrzucił transfer domeny.'),
          wiersz(null),
        ]),
      },
    };
    const service = new DomainRegistrarService(prismaZ as never, audit as never, crypto as never, {} as never, wallet as never, config as never, nbpFx as never, ecoPoints as never, {} as never);
    const wynik = await service.orders('user_1');
    expect(wynik[0].lastError).toMatch(/nie powiodła się/);
    expect(wynik[0].lastError).not.toMatch(/DirectAdmin|CMD_API|2222/);
    expect(wynik[1].lastError).toBe('Rejestr odrzucił transfer domeny.');
    expect(wynik[2].lastError).toBeNull();
  });

  it('fails closed when registrar provider is not configured', async () => {
    const providerFactory = {
      get: vi.fn(() => {
        throw new ServiceUnavailableException('Registrar provider is not configured.');
      }),
    };
    const service = new DomainRegistrarService(
      prisma as never,
      audit as never,
      crypto as never,
      providerFactory as never,
      wallet as never,
      config as never,
      nbpFx as never,
      ecoPoints as never,
      {} as never,
    );

    await expect(service.availability('example.pl')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('checks availability before registering a domain', async () => {
    const provider = {
      availability: vi.fn().mockResolvedValue({ domain: 'example.pl', available: false }),
    };
    const service = new DomainRegistrarService(
      prisma as never,
      audit as never,
      crypto as never,
      { get: () => provider } as never,
      wallet as never,
      config as never,
      nbpFx as never,
      ecoPoints as never,
      {} as never,
    );

    await expect(service.register('user_1', 'user_1', { name: 'Example.pl', registrant: {} as never })).rejects.toThrow(
      'Domena nie jest dostępna',
    );
    expect(provider.availability).toHaveBeenCalledWith('example.pl');
  });

  it('wycena transferu pyta rejestratora o operację transfer (tę samą, którą obciąża portfel)', async () => {
    const provider = { price: vi.fn().mockResolvedValue({ amount: '10.00', currency: 'USD' }) };
    const service = new DomainRegistrarService(
      prisma as never,
      audit as never,
      crypto as never,
      { get: () => provider } as never,
      wallet as never,
      config as never,
      nbpFx as never,
      ecoPoints as never,
      {} as never,
    );

    const q = await service.quoteTransfer('Example.PL', 2);
    expect(provider.price).toHaveBeenCalledWith({ domain: 'example.pl', years: 2, operation: 'transfer' });
    expect(q).toMatchObject({ domain: 'example.pl', years: 2, vatRate: expect.any(Number) });
    expect(Number(q.amount)).toBeGreaterThan(0);
  });
});

describe('opis okresu domeny w historii portfela (t1 04.10: „1 lata/lat”)', () => {
  it.each([[1, '1 rok'], [2, '2 lata'], [4, '4 lata'], [5, '5 lat'], [10, '10 lat'], [12, '12 lat'], [22, '22 lata']])('%i → %s', async (n, opis) => {
    const { lata } = await import('./domain-registrar.service.js');
    expect(lata(n)).toBe(opis);
  });
});

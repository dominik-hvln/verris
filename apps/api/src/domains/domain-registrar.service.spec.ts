import { ServiceUnavailableException } from '@nestjs/common';
import { DomainRegistrarService } from './domain-registrar.service';

describe('DomainRegistrarService', () => {
  const prisma = {};
  const audit = { record: jest.fn() };
  const crypto = { encrypt: jest.fn((v: string) => `enc:${v}`) };
  const wallet = { debit: jest.fn(), credit: jest.fn() };
  const config = { get: jest.fn(() => '1.0') };
  const nbpFx = {
    getRates: jest.fn().mockResolvedValue({
      usdPln: 3.65,
      eurPln: 4.32,
      source: 'env',
      nbpTableNo: null,
      nbpEffectiveDate: null,
      fetchedAt: new Date().toISOString(),
    }),
  };
  const ecoPoints = { safeAward: jest.fn(), awardDomainFirstPaid: jest.fn(), awardDomainRenewal: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('fails closed when registrar provider is not configured', async () => {
    const providerFactory = {
      get: jest.fn(() => {
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
    );

    await expect(service.availability('example.pl')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('checks availability before registering a domain', async () => {
    const provider = {
      availability: jest.fn().mockResolvedValue({ domain: 'example.pl', available: false }),
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
    );

    await expect(service.register('user_1', 'user_1', { name: 'Example.pl' })).rejects.toThrow(
      'Domena nie jest dostępna',
    );
    expect(provider.availability).toHaveBeenCalledWith('example.pl');
  });
});

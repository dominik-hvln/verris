import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DomainRegistrarService } from './domain-registrar.service.js';
import { RegisterDomainDto } from './dto/registrar.dto.js';
import { opKontakt, type Registrant } from './registrar.provider.js';

/**
 * A-13 / A-15 / A-09 (decyzja właściciela 2026-09-23): abonentem domeny jest klient, nie operator.
 * Wcześniej każda domena szła na OPENPROVIDER_OWNER_HANDLE — formalnie należała do Verris.
 */
const JAN: Registrant = {
  firstName: 'Jan', lastName: 'Kowalski', companyName: null, vat: null,
  street: 'Długa', houseNumber: '5/7', zipcode: '00-001', city: 'Warszawa', country: 'PL',
  phoneCountryCode: '+48', phone: '600100200', email: 'jan@example.pl',
};

function zbuduj(provider: Record<string, unknown>, domena: Record<string, unknown> | null = {
  id: 'd1', name: 'jan.pl', userId: 'u1', registrarExternalId: '777', transferLock: true,
}) {
  const prisma = {
    domain: { findFirst: vi.fn().mockResolvedValue(domena), update: vi.fn().mockResolvedValue({}) },
  };
  const audit = { record: vi.fn() };
  const service = new DomainRegistrarService(
    prisma as never, audit as never, {} as never, { get: () => provider } as never,
    {} as never, {} as never, {} as never, {} as never,
  );
  return { service, prisma, audit };
}

describe('A-13 — abonent domeny to klient', () => {
  it('rejestracja zakłada uchwyt klienta PRZED obciążeniem i rejestruje na niego', async () => {
    const kolejnosc: string[] = [];
    const provider = {
      availability: vi.fn().mockResolvedValue({ available: true }),
      createRegistrant: vi.fn(async () => { kolejnosc.push('uchwyt'); throw new Error('stop'); }),
    };
    const { service } = zbuduj(provider);
    const charge = vi.spyOn(service as unknown as { charge: () => Promise<void> }, 'charge').mockImplementation((async () => { kolejnosc.push('portfel'); }) as never);
    await expect(service.register('u1', 'u1', { name: 'jan.pl', registrant: JAN })).rejects.toThrow('stop');
    expect(provider.createRegistrant).toHaveBeenCalledWith(JAN);
    expect(charge).not.toHaveBeenCalled();
    expect(kolejnosc).toEqual(['uchwyt']);
  });

  it('DTO rejestracji bez danych abonenta nie przechodzi', () => {
    const bez = plainToInstance(RegisterDomainDto, { name: 'jan.pl', withdrawalWaiverConsent: true });
    expect(validateSync(bez).map((e) => e.property)).toContain('registrant');
    const z = plainToInstance(RegisterDomainDto, { name: 'jan.pl', withdrawalWaiverConsent: true, registrant: JAN });
    expect(validateSync(z)).toEqual([]);
    const zly = plainToInstance(RegisterDomainDto, {
      name: 'jan.pl', withdrawalWaiverConsent: true, registrant: { ...JAN, country: 'Polska', phone: 'abc' },
    });
    expect(JSON.stringify(validateSync(zly))).toMatch(/country[\s\S]*phone|phone[\s\S]*country/);
  });

  it('zmiana adresu/telefonu idzie do uchwytu abonenta; zmiana imienia = cesja → odmowa', async () => {
    const provider = {
      domainInfo: vi.fn().mockResolvedValue({ ownerHandle: 'JK1-PL', locked: true }),
      getRegistrant: vi.fn().mockResolvedValue(JAN),
      updateRegistrant: vi.fn(),
      operatorHandle: 'OP1-PL',
    };
    const { service, audit } = zbuduj(provider);
    await service.updateRegistrant('u1', 'u1', 'd1', { ...JAN, city: 'Kraków' });
    expect(provider.updateRegistrant).toHaveBeenCalledWith('JK1-PL', expect.objectContaining({ city: 'Kraków' }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOMAIN_REGISTRANT_UPDATED' }));

    provider.updateRegistrant.mockClear();
    await expect(service.updateRegistrant('u1', 'u1', 'd1', { ...JAN, lastName: 'Nowak' })).rejects.toThrow(/cesja/);
    expect(provider.updateRegistrant).not.toHaveBeenCalled();
  });

  it('domena na uchwycie operatora: nie edytujemy go (zmieniłby dane wszystkich takich domen)', async () => {
    const provider = {
      domainInfo: vi.fn().mockResolvedValue({ ownerHandle: 'OP1-PL', locked: true }),
      getRegistrant: vi.fn(), updateRegistrant: vi.fn(), operatorHandle: 'OP1-PL',
    };
    const { service } = zbuduj(provider);
    await expect(service.updateRegistrant('u1', 'u1', 'd1', JAN)).rejects.toThrow(/dane operatora/);
    await expect(service.registrant('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.updateRegistrant).not.toHaveBeenCalled();
  });

  it('cudza domena → 404; domena spoza naszego rejestratora → jasna odmowa', async () => {
    await expect(zbuduj({}, null).service.registrant('u1', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    const obca = zbuduj({}, { id: 'd1', name: 'x.pl', userId: 'u1', registrarExternalId: null });
    await expect(obca.service.authCode('u1', 'u1', 'd1')).rejects.toThrow(/obecnego rejestratora/);
  });

  it('telefon i adres w formacie OpenProvidera', () => {
    const k = opKontakt({ ...JAN, country: 'pl' });
    expect(k.phone).toEqual({ country_code: '+48', area_code: '600', subscriber_number: '100200' });
    expect(k.address).toEqual({ street: 'Długa', number: '5/7', zipcode: '00-001', city: 'Warszawa', country: 'PL' });
    expect(k).not.toHaveProperty('name');
  });
});

describe('A-15 / A-09 — blokada i kod transferu', () => {
  it('blokada: rejestrator + stan w bazie + audyt', async () => {
    const provider = { setTransferLock: vi.fn() };
    const { service, prisma, audit } = zbuduj(provider);
    await expect(service.setTransferLock('u1', 'u1', 'd1', false)).resolves.toEqual({ transferLock: false });
    expect(provider.setTransferLock).toHaveBeenCalledWith('777', false);
    expect(prisma.domain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ transferLock: false }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOMAIN_TRANSFER_UNLOCKED' }));
  });

  it('kod transferu: zwracany klientowi, w audycie tylko fakt wyświetlenia', async () => {
    const provider = { authCode: vi.fn().mockResolvedValue('S3kr3t!') };
    const { service, audit } = zbuduj(provider);
    await expect(service.authCode('u1', 'u1', 'd1')).resolves.toEqual({ authCode: 'S3kr3t!', transferLock: true });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('S3kr3t!');
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DomainRegistrarService } from './domain-registrar.service.js';
import { RegisterDomainDto, TransferDomainDto } from './dto/registrar.dto.js';
import { KOMUNIKAT_BRAK_OSWIADCZENIA, OSWIADCZENIE_REJESTRACJI, OSWIADCZENIE_TRANSFERU, oswiadczenieZamowienia } from './oswiadczenie-domeny.js';

/**
 * Decyzja 21 (4.11.2026) — oświadczenie o natychmiastowym wykonaniu i utracie prawa odstąpienia (art. 38 ust. 1
 * pkt 1 upk) przy KAŻDYM zamówieniu domeny. Na starym kodzie: serwis nie sprawdzał zgody (tylko DTO), zamówienie nie
 * zapisywało ani treści, ani czasu oświadczenia, a `hasStandingWaiverConsent` pozwalał panelowi zaznaczyć je samemu
 * na podstawie pierwszego zakupu („na stałe”).
 */
const ABONENT = {
  firstName: 'Jan', lastName: 'Test', street: 'Testowa', houseNumber: '1', zipcode: '00-001',
  city: 'Poznań', country: 'PL', phoneCountryCode: '+48', phone: '600000000', email: 'jan@test.verris.pl',
};

function serwis() {
  const provider = {
    availability: vi.fn().mockResolvedValue({ domain: 'nowa.pl', available: true, priceAmount: '40.00', currency: 'PLN' }),
    createRegistrant: vi.fn().mockResolvedValue('H-1'),
    price: vi.fn().mockResolvedValue({ amount: '30.00', currency: 'PLN' }),
  };
  const create = vi.fn().mockRejectedValue(new Error('stop po zapisie zamówienia'));
  const prisma = { subscription: { count: async () => 0 }, domainRegistrarOrder: { create } };
  const s = new DomainRegistrarService(
    prisma as never, { record: vi.fn() } as never, { encrypt: (v: string) => `enc:${v}` } as never, { get: () => provider } as never,
    {} as never, { get: () => undefined } as never, { getRates: async () => ({ usdPln: 3.65, eurPln: 4.32 }) } as never,
    {} as never, {} as never,
  );
  return { s, provider, create };
}

describe('decyzja 21 – oświadczenie domenowe przy każdym zamówieniu', () => {
  it.each([undefined, false, 'true', 1])('rejestracja bez oświadczenia w żądaniu (%o) – odrzucona, zanim cokolwiek się stanie', async (zgoda) => {
    const { s, provider, create } = serwis();
    await expect(
      s.register('u1', 'u1', { name: 'nowa.pl', registrant: ABONENT, withdrawalWaiverConsent: zgoda as never }),
    ).rejects.toThrow(KOMUNIKAT_BRAK_OSWIADCZENIA);
    expect(provider.availability).not.toHaveBeenCalled();
    expect(provider.createRegistrant).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('transfer bez oświadczenia – odrzucony przed utworzeniem abonenta i zamówienia', async () => {
    const { s, provider, create } = serwis();
    await expect(
      s.transfer('u1', 'u1', { name: 'stara.pl', authCode: 'KOD', registrant: ABONENT, withdrawalWaiverConsent: false }),
    ).rejects.toThrow(KOMUNIKAT_BRAK_OSWIADCZENIA);
    expect(provider.createRegistrant).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('zamówienie zapisuje treść i chwilę oświadczenia z tego żądania (rejestracja i transfer mają własną treść)', async () => {
    const { s, create } = serwis();
    const przed = Date.now();
    await expect(s.register('u1', 'u1', { name: 'nowa.pl', registrant: ABONENT, withdrawalWaiverConsent: true })).rejects.toThrow('stop');
    await expect(s.transfer('u1', 'u1', { name: 'stara.pl', authCode: 'KOD', registrant: ABONENT, withdrawalWaiverConsent: true })).rejects.toThrow('stop');
    const [rej, tr] = create.mock.calls.map((c) => c[0].data);
    expect(rej.withdrawalWaiverText).toBe(OSWIADCZENIE_REJESTRACJI);
    expect(tr.withdrawalWaiverText).toBe(OSWIADCZENIE_TRANSFERU);
    for (const d of [rej, tr]) {
      expect(d.withdrawalWaiverAt).toBeInstanceOf(Date);
      expect(d.withdrawalWaiverAt.getTime()).toBeGreaterThanOrEqual(przed);
    }
  });

  it('nie ma już oświadczenia „na stałe” z pierwszego zakupu', () => {
    expect('hasStandingWaiverConsent' in DomainRegistrarService.prototype).toBe(false);
    expect(OSWIADCZENIE_REJESTRACJI).not.toMatch(/kolejne/);
  });

  it('API (walidacja DTO): żądanie rejestracji i transferu bez withdrawalWaiverConsent=true jest odrzucane', async () => {
    const baza = { name: 'nowa.pl', registrant: ABONENT };
    for (const Dto of [RegisterDomainDto, TransferDomainDto]) {
      const extra = Dto === TransferDomainDto ? { authCode: 'KOD' } : {};
      for (const zgoda of [undefined, false]) {
        const bledy = await validate(plainToInstance(Dto, { ...baza, ...extra, withdrawalWaiverConsent: zgoda }));
        const pole = bledy.find((b) => b.property === 'withdrawalWaiverConsent');
        expect(Object.values(pole?.constraints ?? {})).toContain(KOMUNIKAT_BRAK_OSWIADCZENIA);
      }
      const ok = await validate(plainToInstance(Dto, { ...baza, ...extra, withdrawalWaiverConsent: true }));
      expect(ok.find((b) => b.property === 'withdrawalWaiverConsent')).toBeUndefined();
    }
  });

  it('oswiadczenieZamowienia: tylko dosłowne true', () => {
    const t = new Date('2026-11-04T10:00:00Z');
    expect(oswiadczenieZamowienia('REGISTER', true, t)).toEqual({ withdrawalWaiverText: OSWIADCZENIE_REJESTRACJI, withdrawalWaiverAt: t });
    expect(() => oswiadczenieZamowienia('TRANSFER', 'true')).toThrow(KOMUNIKAT_BRAK_OSWIADCZENIA);
  });
});

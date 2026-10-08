import { DomainRegistrarOrderStatus, DomainStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DomainRegistrarService } from '../../src/domains/domain-registrar.service.js';
import { DomainsService } from '../../src/domains/domains.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — domeny u rejestratora na prawdziwej bazie: portfel obciążony dokładnie raz,
 * zwrot przy błędzie rejestratora, brak środków bez wywołania rejestratora — i komu
 * przypada domena, za którą klient zapłacił. Rejestrator jest atrapą (to zewnętrzny system).
 */

const abonent = {
  firstName: 'Jan', lastName: 'Test', street: 'Testowa', houseNumber: '1', zipcode: '00-001',
  city: 'Poznań', country: 'PL', phoneCountryCode: '+48', phone: '600000000', email: 'jan@test.verris.pl',
};

let rejestracjaPada = false;
let whoisPada = false;
let stanTransferu: 'active' | 'pending' | 'failed' = 'pending';
const wywolania: string[] = [];
const rejestrator = {
  id: 'atrapa',
  availability: async (domain: string) => ({ domain, available: true, priceAmount: '40.00', currency: 'PLN' }),
  price: async (i: { operation: string }) => ({ amount: i.operation === 'transfer' ? '30.00' : '40.00', currency: 'PLN' }),
  createRegistrant: async () => 'H-ABONENT',
  register: async (i: { domain: string }) => {
    wywolania.push(`register:${i.domain}`);
    if (rejestracjaPada) throw new Error('rejestr odrzucił');
    return { provider: 'atrapa', providerOrderId: `ord-${i.domain}`, externalDomainId: `ext-${i.domain}`, expiresAt: '2027-09-27T00:00:00.000Z' };
  },
  transfer: async (i: { domain: string }) => {
    wywolania.push(`transfer:${i.domain}`);
    return { provider: 'atrapa', providerOrderId: `ext-${i.domain}`, externalDomainId: `ext-${i.domain}` };
  },
  domainInfo: async () => ({ ownerHandle: 'H-ABONENT', locked: true, state: stanTransferu, expiresAt: '2027-11-01T00:00:00.000Z' }),
  setWhoisPrivacy: async (id: string, on: boolean) => {
    wywolania.push(`whois:${id}:${on}`);
    if (whoisPada) throw new Error('OpenProvider: Whois privacy is not supported for this extension');
  },
  renew: async (i: { domain: string }) => {
    wywolania.push(`renew:${i.domain}`);
    return { provider: 'atrapa', providerOrderId: `rn-${i.domain}`, expiresAt: '2028-09-27T00:00:00.000Z' };
  },
};

function uslugi() {
  const p = prisma() as never;
  const nbp = { getRates: async () => ({ usdPln: 3.65, eurPln: 4.32 }) };
  const eco = { safeAward: () => undefined };
  return {
    rejestr: new DomainRegistrarService(
      p, new AuditService(p), { encrypt: (v: string) => `enc:${v}` } as never, { get: () => rejestrator } as never,
      new WalletLedgerService(p), { get: () => undefined } as never, nbp as never, eco as never, { getWhoisPrivacyPrice: async () => '19.99' } as never,
    ),
    domeny: new DomainsService(p, null as never),
  };
}

let n = 0;
const klient = (saldo: number) => {
  n += 1;
  return prisma().user.create({ data: { email: `domeny-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const obciazenia = (userId: string) => prisma().walletTransaction.findMany({ where: { userId, type: WalletTxType.CHARGE_DOMAIN } });

describe('X-04 domeny u rejestratora', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    rejestracjaPada = false;
    stanTransferu = 'pending';
    wywolania.length = 0;
  });
  afterAll(rozlacz);

  it('rejestracja: jedno obciążenie za wycenioną kwotę, domena aktywna na koncie płacącego', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    const [wycena] = (await rejestr.quotePeriods('moja-firma.pl', [1])).quotes;

    await rejestr.register(u.id, u.id, { name: 'Moja-Firma.pl', registrant: abonent });

    const tx = await obciazenia(u.id);
    expect(tx).toHaveLength(1);
    expect(Math.abs(Number(tx[0].amount))).toBeCloseTo(Number(wycena.priceAmount), 2);
    expect(await saldo(u.id)).toBeCloseTo(500 - Number(wycena.priceAmount), 2);
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'moja-firma.pl' } });
    expect(d).toMatchObject({ userId: u.id, status: DomainStatus.ACTIVE, registrarExternalId: 'ext-moja-firma.pl' });
  });

  it('rejestrator odrzuca: pełny zwrot, zlecenie nieudane, domeny brak', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    rejestracjaPada = true;

    await expect(rejestr.register(u.id, u.id, { name: 'odrzucona.pl', registrant: abonent })).rejects.toThrow('rejestr odrzucił');

    expect(await saldo(u.id)).toBe(500);
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(z.status).toBe(DomainRegistrarOrderStatus.FAILED);
    expect(await prisma().domain.findUnique({ where: { name: 'odrzucona.pl' } })).toBeNull();
  });

  it('brak środków: odmowa bez wywołania rejestratora, portfel nietknięty', async () => {
    const { rejestr } = uslugi();
    const u = await klient(5);

    await expect(rejestr.register(u.id, u.id, { name: 'za-droga.pl', registrant: abonent })).rejects.toThrow('Brak wystarczających środków');

    expect(wywolania).toEqual([]);
    expect(await saldo(u.id)).toBe(5);
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(z.status).toBe(DomainRegistrarOrderStatus.PENDING_PAYMENT);
  });

  it('cudza niezweryfikowana rezerwacja nazwy nie przejmuje domeny, za którą zapłacił ktoś inny', async () => {
    const { rejestr, domeny } = uslugi();
    const intruz = await klient(0);
    const placacy = await klient(500);
    // Intruz dopisuje do swojego konta nazwę, której nikt jeszcze nie zarejestrował (PENDING, bez weryfikacji).
    await domeny.create(intruz.id, { name: 'cudza-marka.pl' } as never);

    await rejestr.register(placacy.id, placacy.id, { name: 'cudza-marka.pl', registrant: abonent });

    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'cudza-marka.pl' } });
    expect(d.userId).toBe(placacy.id);
    expect(d.status).toBe(DomainStatus.ACTIVE);
    // Kod transferu i blokada idą po właścicielu wiersza — intruz nie może ich dostać.
    await expect(rejestr.authCode(intruz.id, intruz.id, d.id)).rejects.toThrow('nie została znaleziona');
  });

  it('transfer: portfel obciążony dokładnie kwotą z wyceny pokazanej przed zleceniem', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    const wycena = await rejestr.quoteTransfer('przenoszona.pl', 1);

    await rejestr.transfer(u.id, u.id, { name: 'przenoszona.pl', authCode: 'KOD-123', registrant: abonent });

    const [tx] = await obciazenia(u.id);
    expect(Math.abs(Number(tx.amount))).toBeCloseTo(Number(wycena.amount), 2);
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(z).toMatchObject({ status: DomainRegistrarOrderStatus.SUBMITTED, authCodeEnc: 'enc:KOD-123' });
  });

  it('odnowienie cudzej domeny: 404 bez obciążenia i bez wywołania rejestratora', async () => {
    const { rejestr } = uslugi();
    const wlasciciel = await klient(500);
    const obcy = await klient(500);
    await rejestr.register(wlasciciel.id, wlasciciel.id, { name: 'odnawiana.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'odnawiana.pl' } });
    wywolania.length = 0;

    await expect(rejestr.renew(obcy.id, obcy.id, d.id, 1)).rejects.toThrow('nie została znaleziona');

    expect(wywolania).toEqual([]);
    expect(await saldo(obcy.id)).toBe(500);
  });
  it('dwuklik „Odnów”: jedno obciążenie i jedno odnowienie u rejestratora', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    await rejestr.register(u.id, u.id, { name: 'dwuklik.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'dwuklik.pl' } });
    wywolania.length = 0;
    await Promise.all([rejestr.renew(u.id, u.id, d.id, 1).catch(() => undefined), rejestr.renew(u.id, u.id, d.id, 1).catch(() => undefined)]);
    expect(wywolania.filter((w) => w.startsWith('renew:'))).toHaveLength(1);
    expect(await prisma().walletTransaction.count({ where: { userId: u.id, type: WalletTxType.CHARGE_DOMAIN, description: { startsWith: 'Odnowienie domeny dwuklik.pl' } } })).toBe(1);
  });
  it('dwuklik „Odnów”, gdy drugie kliknięcie dostaje blokadę dopiero po zakończeniu pierwszego: 409, jedno obciążenie', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    await rejestr.register(u.id, u.id, { name: 'dwuklik-po.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'dwuklik-po.pl' } });
    wywolania.length = 0;
    await rejestr.renew(u.id, u.id, d.id, 1);
    await expect(rejestr.renew(u.id, u.id, d.id, 1)).rejects.toThrow('właśnie odnowiona');
    expect(wywolania.filter((w) => w.startsWith('renew:'))).toHaveLength(1);
    expect(await prisma().walletTransaction.count({ where: { userId: u.id, type: WalletTxType.CHARGE_DOMAIN, description: { startsWith: 'Odnowienie domeny dwuklik-po.pl' } } })).toBe(1);
  });
  it('A-14 ukrycie WHOIS: dwuklik = jedno obciążenie; odmowa rejestru = zwrot i stan bez zmian', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    await rejestr.register(u.id, u.id, { name: 'prywatna.com', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'prywatna.com' } });
    const przed = await saldo(u.id);
    wywolania.length = 0;
    await Promise.all([rejestr.setWhoisPrivacy(u.id, u.id, d.id, true).catch(() => undefined), rejestr.setWhoisPrivacy(u.id, u.id, d.id, true).catch(() => undefined)]);
    expect(wywolania.filter((w) => w.startsWith('whois:'))).toHaveLength(1);
    expect(przed - (await saldo(u.id))).toBeCloseTo(19.99, 2);
    expect((await prisma().domain.findUniqueOrThrow({ where: { id: d.id } })).whoisPrivacy).toBe(true);
    expect(await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { domainId: d.id, type: 'WHOIS_PRIVACY' } })).toMatchObject({ status: DomainRegistrarOrderStatus.COMPLETED });

    await rejestr.register(u.id, u.id, { name: 'odmowa.pl', registrant: abonent });
    const pl = await prisma().domain.findUniqueOrThrow({ where: { name: 'odmowa.pl' } });
    const przedPl = await saldo(u.id);
    whoisPada = true;
    await expect(rejestr.setWhoisPrivacy(u.id, u.id, pl.id, true)).rejects.toThrow('Rejestr tej domeny nie pozwala');
    whoisPada = false;
    expect(await saldo(u.id)).toBe(przedPl);
    expect((await prisma().domain.findUniqueOrThrow({ where: { id: pl.id } })).whoisPrivacy).toBe(false);
  });
  it('transfer zakończony u rejestratora: domena na koncie płacącego, zlecenie zamknięte raz', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    await rejestr.transfer(u.id, u.id, { name: 'przeniesiona.pl', authCode: 'KOD', registrant: abonent });

    expect(await rejestr.domknijTransfery()).toEqual({ zakonczone: 0, nieudane: 0 }); // w toku — nic
    stanTransferu = 'active';
    expect(await rejestr.domknijTransfery()).toEqual({ zakonczone: 1, nieudane: 0 });
    expect(await rejestr.domknijTransfery()).toEqual({ zakonczone: 0, nieudane: 0 });

    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'przeniesiona.pl' } });
    expect(d).toMatchObject({ userId: u.id, status: DomainStatus.ACTIVE, registrarExternalId: 'ext-przeniesiona.pl', registrarStatus: 'TRANSFERRED' });
    expect(d.expiresAt?.toISOString()).toBe('2027-11-01T00:00:00.000Z');
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(z).toMatchObject({ status: DomainRegistrarOrderStatus.COMPLETED, domainId: d.id });
  });

  it('transfer odrzucony przez rejestr: zwrot na portfel, zlecenie nieudane, domeny brak', async () => {
    const { rejestr } = uslugi();
    const u = await klient(500);
    await rejestr.transfer(u.id, u.id, { name: 'nieprzeniesiona.pl', authCode: 'ZLY', registrant: abonent });
    expect(await saldo(u.id)).toBeLessThan(500);

    stanTransferu = 'failed';
    expect(await rejestr.domknijTransfery()).toEqual({ zakonczone: 0, nieudane: 1 });
    expect(await rejestr.domknijTransfery()).toEqual({ zakonczone: 0, nieudane: 0 });

    expect(await saldo(u.id)).toBe(500);
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: u.id } });
    expect(z.status).toBe(DomainRegistrarOrderStatus.FAILED);
    expect(await prisma().domain.findUnique({ where: { name: 'nieprzeniesiona.pl' } })).toBeNull();
  });
});

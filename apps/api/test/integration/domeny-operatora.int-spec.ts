import { DomainRegistrarOrderStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { DomainRegistrarService } from '../../src/domains/domain-registrar.service.js';
import { DomenyOperatoraService } from '../../src/domains/domeny-operatora.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * F2.7 (D8) — ścieżki pieniężne operacji obsługi na domenach, na prawdziwej bazie: odnowienie z portfela klienta
 * (jedno obciążenie, aktywność klienta „obsługa Verris (zgłoszenie #…)”, dziennik zespołu z powodem), odnowienie na
 * koszt Verris (portfel nietknięty, także przy błędzie rejestratora) i ponowienie nieudanej rejestracji (nowe
 * obciążenie po zwrocie, jedno ponowienie). Rejestrator jest atrapą (system zewnętrzny).
 */

const abonent = {
  firstName: 'Jan', lastName: 'Test', street: 'Testowa', houseNumber: '1', zipcode: '00-001',
  city: 'Poznań', country: 'PL', phoneCountryCode: '+48', phone: '600000000', email: 'jan@test.verris.pl',
};

let rejestracjaPada = false;
let odnowieniePada = false;
const wywolania: string[] = [];
const rejestrator = {
  id: 'atrapa',
  availability: async (domain: string) => ({ domain, available: true, priceAmount: '40.00', currency: 'PLN' }),
  price: async () => ({ amount: '40.00', currency: 'PLN' }),
  createRegistrant: async () => 'H-ABONENT',
  register: async (i: { domain: string; ownerHandle: string }) => {
    wywolania.push(`register:${i.domain}:${i.ownerHandle}`);
    if (rejestracjaPada) throw new Error('rejestr odrzucił');
    return { provider: 'atrapa', providerOrderId: `ord-${i.domain}`, externalDomainId: `ext-${i.domain}`, expiresAt: '2027-09-27T00:00:00.000Z' };
  },
  renew: async (i: { domain: string }) => {
    wywolania.push(`renew:${i.domain}`);
    if (odnowieniePada) throw new Error('OpenProvider: domain is in redemption');
    return { provider: 'atrapa', providerOrderId: `rn-${i.domain}`, expiresAt: '2028-09-27T00:00:00.000Z' };
  },
};

function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const rejestr = new DomainRegistrarService(
    p, audit, { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.replace(/^enc:/, '') } as never, { get: () => rejestrator } as never,
    new WalletLedgerService(p), { get: () => undefined } as never, { getRates: async () => ({ usdPln: 3.65, eurPln: 4.32 }) } as never,
    { safeAward: () => undefined } as never, { getWhoisPrivacyPrice: async () => null } as never,
  );
  return { rejestr, domeny: new DomenyOperatoraService(p, rejestr, audit) };
}

let n = 0;
const uzytkownik = (saldo: number, role: 'USER' | 'STAFF' = 'USER') => {
  n += 1;
  return prisma().user.create({ data: { email: `domeny-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, role } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const transakcje = (userId: string) => prisma().walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const aktywnosc = (userId: string) =>
  new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(userId);

describe('F2.7 — operacje obsługi na domenach (pieniądze)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    rejestracjaPada = false;
    odnowieniePada = false;
    wywolania.length = 0;
  });
  afterAll(rozlacz);

  it('odnowienie z portfela klienta przez obsługę: jedno obciążenie, klient widzi „obsługa Verris (zgłoszenie #…)”, zespół — powód', async () => {
    const { rejestr, domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    await rejestr.register(k.id, k.id, { name: 'klienta.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'klienta.pl' } });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'Domena wygasa', message: 'x' } });
    const przed = await saldo(k.id);

    const z = await domeny.odnow(d.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Auto-odnowienie padło, klient prosi', zgloszenie: `#${zgl.id.slice(0, 8)}` }, 1, false);

    expect(z).toMatchObject({ status: DomainRegistrarOrderStatus.COMPLETED });
    expect(z.walletTxId).toBeTruthy();
    expect(przed - (await saldo(k.id))).toBeCloseTo(Number(z.priceAmount), 2);
    expect((await transakcje(k.id)).filter((t) => t.type === WalletTxType.CHARGE_DOMAIN && t.description?.startsWith('Odnowienie'))).toHaveLength(1);
    expect((await prisma().domain.findUniqueOrThrow({ where: { id: d.id } })).expiresAt?.toISOString()).toBe('2028-09-27T00:00:00.000Z');

    const { events } = await aktywnosc(k.id);
    expect(events.find((e) => e.action === 'DOMAIN_REGISTRAR_RENEWED')).toMatchObject({
      context: 'klienta.pl',
      actor: `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`,
    });
    const zespol = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_DOMAIN_CHANGED', userId: k.id } });
    expect(zespol).toMatchObject({ actorUserId: op.id });
    expect(zespol.details).toMatchObject({ akcja: 'odnowienie', platnik: 'portfel-klienta', powod: 'Auto-odnowienie padło, klient prosi', zgloszenieId: zgl.id, wynik: 'ok' });
  });

  it('brak środków u klienta: odmowa, rejestrator nie wołany, wpis „blad” w dzienniku zespołu', async () => {
    const { rejestr, domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    await rejestr.register(k.id, k.id, { name: 'pusty-portfel.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'pusty-portfel.pl' } });
    await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 5 } });
    wywolania.length = 0;

    await expect(domeny.odnow(d.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Klient prosi o odnowienie' }, 1, false)).rejects.toThrow('Brak wystarczających środków');

    expect(wywolania).toEqual([]);
    const zespol = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_DOMAIN_CHANGED', userId: k.id } });
    expect(zespol.details).toMatchObject({ wynik: 'blad' });
  });

  it('D8 — na koszt Verris: portfel klienta nietknięty (nawet pusty), zamówienie bez transakcji, ważność przedłużona', async () => {
    const { rejestr, domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    await rejestr.register(k.id, k.id, { name: 'gratis.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'gratis.pl' } });
    await prisma().user.update({ where: { id: k.id }, data: { walletBalance: 0 } });
    const przed = await saldo(k.id);
    const txPrzed = (await transakcje(k.id)).length;

    const z = await domeny.odnow(d.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Nasza awaria auto-odnowienia, domena wygasa' }, 1, true);

    expect(z).toMatchObject({ status: DomainRegistrarOrderStatus.COMPLETED, walletTxId: null });
    expect(await saldo(k.id)).toBe(przed);
    expect((await transakcje(k.id)).length).toBe(txPrzed);
    expect((await prisma().domain.findUniqueOrThrow({ where: { id: d.id } })).expiresAt?.toISOString()).toBe('2028-09-27T00:00:00.000Z');
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'DOMAIN_REGISTRAR_RENEWED', userId: k.id } });
    expect(wpis.details).toMatchObject({ naKosztVerris: true, walletTxId: null, domain: 'gratis.pl' });
    const { events } = await aktywnosc(k.id);
    expect(events.find((e) => e.action === 'DOMAIN_REGISTRAR_RENEWED')?.actor).toBe('obsługa Verris');
  });

  it('D8 — na koszt Verris i błąd rejestratora: zamówienie nieudane, bez zwrotu (nic nie pobrano), saldo bez zmian', async () => {
    const { rejestr, domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    await rejestr.register(k.id, k.id, { name: 'redemption.pl', registrant: abonent });
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'redemption.pl' } });
    const przed = await saldo(k.id);
    odnowieniePada = true;

    await expect(domeny.odnow(d.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Nasza awaria auto-odnowienia' }, 1, true)).rejects.toThrow('redemption');

    expect(await saldo(k.id)).toBe(przed);
    expect((await transakcje(k.id)).filter((t) => t.type === WalletTxType.REFUND)).toEqual([]);
    const z = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { domainId: d.id, type: 'RENEW' } });
    expect(z).toMatchObject({ status: DomainRegistrarOrderStatus.FAILED, walletTxId: null });
  });

  it('ponowienie nieudanej rejestracji: zwrot za pierwszą, jedno nowe obciążenie, domena u klienta; drugie ponowienie — 409', async () => {
    const { rejestr, domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    rejestracjaPada = true;
    await expect(rejestr.register(k.id, k.id, { name: 'ponowiona.pl', registrant: abonent })).rejects.toThrow('rejestr odrzucił');
    const stare = await prisma().domainRegistrarOrder.findFirstOrThrow({ where: { userId: k.id } });
    expect(stare).toMatchObject({ status: DomainRegistrarOrderStatus.FAILED, ownerHandle: 'H-ABONENT' });
    expect(await saldo(k.id)).toBe(500);
    rejestracjaPada = false;
    wywolania.length = 0;

    const nowe = await domeny.ponow(stare.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' });

    expect(nowe).toMatchObject({ status: DomainRegistrarOrderStatus.COMPLETED });
    expect(nowe.id).not.toBe(stare.id);
    expect(wywolania).toEqual(['register:ponowiona.pl:H-ABONENT']);
    expect(await saldo(k.id)).toBeCloseTo(500 - Number(nowe.priceAmount), 2);
    const d = await prisma().domain.findUniqueOrThrow({ where: { name: 'ponowiona.pl' } });
    expect(d.userId).toBe(k.id);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'DOMAIN_REGISTRAR_REGISTERED', userId: k.id } });
    expect(wpis).toMatchObject({ actorUserId: op.id });
    expect(wpis.details).toMatchObject({ ponowienieZamowieniaId: stare.id });

    await expect(domeny.ponow(stare.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' })).rejects.toThrow('już ponowione');
    expect(await saldo(k.id)).toBeCloseTo(500 - Number(nowe.priceAmount), 2);
    expect((await transakcje(k.id)).filter((t) => t.type === WalletTxType.CHARGE_DOMAIN)).toHaveLength(2);
    expect((await transakcje(k.id)).filter((t) => t.type === WalletTxType.REFUND)).toHaveLength(1);
    expect((await domeny.zamowienia()).nieudane).toEqual([]);
  });

  it('zamówienie sprzed zapisu abonenta: ponowienie odmówione bez obciążenia; lista nieudanych je pokazuje', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    const stare = await prisma().domainRegistrarOrder.create({
      data: { domainName: 'stara.pl', type: 'REGISTER', status: 'FAILED', userId: k.id, years: 1, priceAmount: '40.00' },
    });
    expect((await domeny.zamowienia()).nieudane).toEqual([expect.objectContaining({ id: stare.id, moznaPonowic: false })]);
    expect((await domeny.lista({})).liczby.nieudane).toBe(1);

    await expect(domeny.ponow(stare.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' })).rejects.toThrow('sprzed zapisu abonenta');
    expect(await saldo(k.id)).toBe(500);
    expect(wywolania).toEqual([]);
  });

  it('audyt Fal 2 — zamówienie bez zapisanej ceny: ponowienie odmówione bez obciążenia (nie ma kwoty, którą klient przyjął)', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    const stare = await prisma().domainRegistrarOrder.create({
      data: { domainName: 'bez-ceny.pl', type: 'REGISTER', status: 'FAILED', userId: k.id, years: 1, ownerHandle: 'H-ABONENT' },
    });
    expect((await domeny.zamowienia()).nieudane).toEqual([expect.objectContaining({ id: stare.id, moznaPonowic: false })]);
    // Przegląd poprawek — karta domeny liczyła moznaPonowic bez warunku ceny: przycisk „Ponów”, który API zawsze odrzuca.
    const d = await prisma().domain.create({ data: { name: 'bez-ceny.pl', userId: k.id } });
    expect((await domeny.karta(d.id)).zamowienia).toEqual([expect.objectContaining({ id: stare.id, moznaPonowic: false })]);
    await expect(domeny.ponow(stare.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' })).rejects.toThrow('bez zapisanej ceny');
    expect(await saldo(k.id)).toBe(500);
    expect(wywolania).toEqual([]);
  });

  it('przegląd: opłacone pierwsze zamówienie bez zaksięgowanego zwrotu — ponowienie odmówione, bez drugiego obciążenia', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    const stare = await prisma().domainRegistrarOrder.create({
      data: { domainName: 'bez-zwrotu.pl', type: 'REGISTER', status: 'FAILED', userId: k.id, years: 1, priceAmount: '40.00', ownerHandle: 'H-ABONENT' },
    });
    // Obciążenie jak w charge(), a zwrot z refundAndFail się nie zapisał („wymaga ręcznej korekty”).
    await new WalletLedgerService(prisma() as never).debit({
      userId: k.id, amount: '40.00', type: WalletTxType.CHARGE_DOMAIN, description: 'Rejestracja domeny bez-zwrotu.pl',
      idempotencyKey: `domain-register:${stare.id}`,
    });
    const przed = await saldo(k.id);

    await expect(domeny.ponow(stare.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' })).rejects.toThrow('zwrot nie został zaksięgowany');

    expect(await saldo(k.id)).toBe(przed);
    expect(wywolania).toEqual([]);
    expect(await prisma().domainRegistrarOrder.count({ where: { userId: k.id } })).toBe(1);
  });

  it('przegląd: nieudane ponowienie zastępuje pierwotne zamówienie — na liście jedno „Ponów” na domenę', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(500);
    const dane = { domainName: 'dwa-razy.pl', type: 'REGISTER' as const, status: 'FAILED' as const, userId: k.id, years: 1, priceAmount: '40.00', ownerHandle: 'H-ABONENT' };
    await prisma().domainRegistrarOrder.create({ data: { ...dane, createdAt: new Date(Date.now() - 60_000) } });
    const ponowione = await prisma().domainRegistrarOrder.create({ data: dane });

    expect((await domeny.zamowienia()).nieudane.map((z) => z.id)).toEqual([ponowione.id]);
  });

  it('przegląd: „Ponów” na dwóch nieudanych zamówieniach tej samej domeny naraz — drugie czeka i dostaje 409, jedno obciążenie', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(500);
    const op = await uzytkownik(0, 'STAFF');
    const dane = { domainName: 'naraz.pl', type: 'REGISTER' as const, status: 'FAILED' as const, userId: k.id, years: 1, priceAmount: '40.00', ownerHandle: 'H-ABONENT' };
    const pierwotne = await prisma().domainRegistrarOrder.create({ data: { ...dane, createdAt: new Date(Date.now() - 120_000) } });
    const ponowienie = await prisma().domainRegistrarOrder.create({ data: { ...dane, createdAt: new Date(Date.now() - 60_000) } });

    // Inny operator ponawia `ponowienie` w tej chwili: trzyma blokadę jego wiersza i ma już nowe (niezatwierdzone) zamówienie.
    let zablokowane!: () => void;
    const gotowe = new Promise<void>((r) => (zablokowane = r));
    const drugi = prisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DomainRegistrarOrder" WHERE id = ${ponowienie.id} FOR UPDATE`;
      await tx.domainRegistrarOrder.create({ data: { ...dane, status: 'QUEUED' } });
      zablokowane();
      await new Promise((r) => setTimeout(r, 400));
    });
    await gotowe;

    await expect(domeny.ponow(pierwotne.id, { operatorUserId: op.id, operatorRole: 'STAFF', powod: 'Rejestr miał przerwę, ponawiam' })).rejects.toThrow('już ponowione');
    await drugi;

    expect(wywolania).toEqual([]);
    expect(await saldo(k.id)).toBe(500);
  });

  it('lista: filtr „wygasające w N dni” bierze tylko domeny u nas, od najbliższej', async () => {
    const { domeny } = uslugi();
    const k = await uzytkownik(0);
    const za = (dni: number) => new Date(Date.now() + dni * 86_400_000);
    await prisma().domain.createMany({
      data: [
        { name: 'za-10.pl', userId: k.id, registrarExternalId: 'e1', expiresAt: za(10), status: 'ACTIVE' },
        { name: 'za-5.pl', userId: k.id, registrarExternalId: 'e2', expiresAt: za(5), status: 'ACTIVE' },
        { name: 'za-90.pl', userId: k.id, registrarExternalId: 'e3', expiresAt: za(90), status: 'ACTIVE' },
        { name: 'obca.pl', userId: k.id, expiresAt: za(3), status: 'ACTIVE' },
      ],
    });
    const r = await domeny.lista({ wygasa: 30 });
    expect(r.rows.map((x) => x.name)).toEqual(['za-5.pl', 'za-10.pl']);
    expect(r.liczby).toMatchObject({ verris: 3, wygasa30: 2 });
    expect((await domeny.lista({ rejestr: 'poza' })).rows.map((x) => x.name)).toEqual(['obca.pl']);
  });
});

import { PrismaClient } from '@verris/database';
import { planCzyszczenia, wykonajCzyszczenie, opisPlanu, sprawdzArgumenty } from '../../src/cli/czyszczenie-przed-beta.plan.js';
import { nadajNumerFaktury, okresNumeracji } from '../../src/billing/faktura-za-portfel.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Czyszczenie przed otwartą betą na prawdziwej bazie: podgląd nic nie zmienia; blokady (konto na węźle, faktura
 * w KSeF produkcyjnym) zatrzymują usunięcie; potwierdzenie musi zgadzać się z podglądem; zespół i lista
 * „zachowaj” zostają, a dane klientów testowych znikają kaskadą.
 */
let n = 0;
const klient = (email: string, extra: Record<string, unknown> = {}) =>
  prisma().user.create({ data: { email, passwordHash: 'x', walletBalance: 10, ...extra } });

async function dane() {
  const plan = await utworzPlan();
  const admin = await klient(`admin-${++n}@verris.pl`, { role: 'ADMIN' });
  const zostaje = await klient('staly-klient@firma.pl');
  const test1 = await klient('test1@test.verris.pl');
  const test2 = await klient('test2@test.verris.pl');
  await prisma().subscription.create({ data: { userId: test1.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'CANCELED' } });
  await prisma().invoice.create({
    data: { userId: test1.id, number: 'VFV/2026/10/0001', amount: 1.23, rodzajPrawny: 'FAKTURA_VAT', ksefStatus: 'ACCEPTED', ksefSrodowisko: 'test' } as never,
  });
  await prisma().auditLog.create({ data: { action: 'TEST', userId: test2.id } });
  await prisma().invoiceCounter.create({ data: { series: 'VFV', year: 2026, month: 10, seq: 1 } });
  return { admin, zostaje, test1, test2, plan };
}

describe('Czyszczenie panelu przed betą', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);
  const db = () => prisma() as unknown as PrismaClient;

  it('podgląd: kogo i co usunie, bez żadnej zmiany w bazie', async () => {
    const { test1 } = await dane();
    const p = await planCzyszczenia(db(), ['STALY-KLIENT@firma.pl', 'literowka@firma.pl']);
    expect(p.doUsuniecia.map((k) => k.email).sort()).toEqual(['test1@test.verris.pl', 'test2@test.verris.pl']);
    expect(p.zachowani).toEqual(['staly-klient@firma.pl']);
    expect(p.nieznalezieni).toEqual(['literowka@firma.pl']);
    expect(p.zespol).toBe(1);
    expect(p.kaskada).toEqual(expect.arrayContaining([{ tabela: 'Subscription', kolumna: 'userId', wierszy: 1 }, { tabela: 'Invoice', kolumna: 'userId', wierszy: 1 }]));
    expect(p.odpiete).toEqual([{ tabela: 'AuditLog', kolumna: 'userId', wierszy: 1 }]);
    expect(p.pieniadze).toMatchObject({ saldoK: '20.00', fakturKsefTest: 1 });
    expect(p.blokady).toEqual([]);
    expect(opisPlanu(p)).toContain('Klienci do usunięcia: 2');
    expect(await prisma().user.count()).toBe(4);
    expect(await prisma().invoice.count({ where: { userId: test1.id } })).toBe(1);
  });

  it('blokady: konto na węźle i faktura w KSeF produkcyjnym — usunięcie odmawia, baza bez zmian', async () => {
    const { test1, test2, plan } = await dane();
    const w = await utworzWezel();
    const sub = await prisma().subscription.create({ data: { userId: test1.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE' } });
    await prisma().account.create({
      data: { userId: test1.id, subscriptionId: sub.id, serverId: w.id, daUsername: 'tst1', domain: 'tst1.pl', status: 'ACTIVE' } as never,
    });
    await prisma().invoice.create({
      data: { userId: test2.id, number: 'VFV/2026/11/0001', amount: 1.23, rodzajPrawny: 'FAKTURA_VAT', ksefStatus: 'ACCEPTED', ksefSrodowisko: 'prod' } as never,
    });
    const p = await planCzyszczenia(db(), ['staly-klient@firma.pl']);
    expect(p.blokady.map((b) => b.email).sort()).toEqual(['test1@test.verris.pl', 'test2@test.verris.pl']);
    await expect(wykonajCzyszczenie(db(), ['staly-klient@firma.pl'], { potwierdzenie: 2 })).rejects.toThrow('Są blokady');
    expect(await prisma().user.count()).toBe(4);
  });

  it('wykonanie: potwierdzenie z podglądu; zespół i „zachowaj” zostają, klienci testowi znikają z danymi', async () => {
    const { admin, zostaje } = await dane();
    await expect(wykonajCzyszczenie(db(), ['staly-klient@firma.pl'], { potwierdzenie: 3 })).rejects.toThrow('Potwierdzenie 3');
    expect(await prisma().user.count()).toBe(4);
    const r = await wykonajCzyszczenie(db(), ['staly-klient@firma.pl'], { potwierdzenie: 2 });
    expect(r).toEqual({ usunieto: 2, wyzerowanoNumeracje: false });
    expect((await prisma().user.findMany({ select: { id: true } })).map((u) => u.id).sort()).toEqual([admin.id, zostaje.id].sort());
    expect(await prisma().invoice.count()).toBe(0);
    expect(await prisma().subscription.count()).toBe(0);
    expect(await prisma().auditLog.count({ where: { action: 'TEST', userId: null } })).toBe(1);
    expect(await prisma().invoiceCounter.count()).toBe(1);
    expect(await prisma().auditLog.count({ where: { action: 'CZYSZCZENIE_PRZED_BETA' } })).toBe(1);
  });

  it('--zeruj-numeracje: liczniki serii bez pozostałych dokumentów usunięte (nowe dokumenty od 0001)', async () => {
    await dane();
    await wykonajCzyszczenie(db(), [], { potwierdzenie: 3, zerujNumeracje: true });
    expect(await prisma().invoiceCounter.count()).toBe(0);
    expect(await prisma().user.count({ where: { role: 'USER' } })).toBe(0);
  });
});

/**
 * Przegląd 15.10 — przypadki brzegowe czyszczenia (skrypt uruchamiany na produkcji przed przełączeniem KSeF na PROD).
 * B, C, C2, D, G, H byli czerwoni na kodzie sprzed poprawki.
 */
describe('Czyszczenie przed betą — przegląd 15.10', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);
  const klient = (email: string, extra: Record<string, unknown> = {}) => prisma().user.create({ data: { email, passwordHash: 'x', ...extra } });
  const db = () => prisma() as unknown as PrismaClient;

  it('A1: klient testowy z usuniętą usługą (Account DELETED + Subscription) — czyszczenie przechodzi', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    const t = await klient('t-konto@test.pl');
    const sub = await prisma().subscription.create({ data: { userId: t.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'CANCELED' } });
    await prisma().account.create({
      data: { userId: t.id, subscriptionId: sub.id, serverId: w.id, daUsername: 'tdel1', domain: 'tdel1.pl', status: 'DELETED' } as never,
    });
    const p = await planCzyszczenia(db(), []);
    expect(p.blokady).toEqual([]);
    await expect(wykonajCzyszczenie(db(), [], { potwierdzenie: 1 })).resolves.toMatchObject({ usunieto: 1 });
  });

  it('A2: klient testowy z fakturą i jej korektą — czyszczenie przechodzi', async () => {
    const t = await klient('t-korekta@test.pl');
    const f = await prisma().invoice.create({
      data: { userId: t.id, number: 'VFV/2026/10/0001', amount: 1.23, ksefStatus: 'ACCEPTED', ksefSrodowisko: 'test' } as never,
    });
    await prisma().invoice.create({
      data: { userId: t.id, number: 'VFK/2026/10/0001', amount: -1.23, kind: 'KOREKTA', correctedId: f.id, correctionKind: 'WARTOSCIOWA', correctionReason: 'zwrot', ksefSrodowisko: 'test' } as never,
    });
    await expect(wykonajCzyszczenie(db(), [], { potwierdzenie: 1 })).resolves.toMatchObject({ usunieto: 1 });
  });

  it('B: subkonto z listy „zachowaj” pod właścicielem spoza listy — blokada, subkonto zostaje', async () => {
    const owner = await klient('wlasciciel-testowy@test.pl');
    const sub = await klient('pracownik@firma.pl', { customerOwnerId: owner.id });
    const p = await planCzyszczenia(db(), ['pracownik@firma.pl']);
    expect(p.zachowani).toEqual(['pracownik@firma.pl']);
    expect(p.blokady).toEqual([{ email: 'pracownik@firma.pl', powod: expect.stringContaining('wlasciciel-testowy@test.pl') }]);
    await expect(wykonajCzyszczenie(db(), ['pracownik@firma.pl'], { potwierdzenie: 1 })).rejects.toThrow('Są blokady');
    expect(await prisma().user.findUnique({ where: { id: sub.id } })).not.toBeNull();
  });

  it('B2: właściciel i jego subkonto spoza listy — oba usunięte jednym poleceniem (liczba się zgadza)', async () => {
    const owner = await klient('wl2@test.pl');
    await klient('sub2@test.pl', { customerOwnerId: owner.id });
    await expect(wykonajCzyszczenie(db(), [], { potwierdzenie: 2 })).resolves.toMatchObject({ usunieto: 2 });
    expect(await prisma().user.count({ where: { role: 'USER' } })).toBe(0);
  });

  it('C: --zeruj-numeracje przy zachowanym kliencie z fakturą z bieżącego miesiąca — kolejny numer nie dubluje', async () => {
    const teraz = new Date();
    const { rok, miesiac } = okresNumeracji(teraz);
    const mm = String(miesiac).padStart(2, '0');
    const staly = await klient('staly@firma.pl');
    await klient('t1@test.pl');
    await prisma().invoice.create({ data: { userId: staly.id, number: `VFV/${rok}/${mm}/0001`, amount: 45 } as never });
    await prisma().invoiceCounter.create({ data: { series: 'VFV', year: rok, month: miesiac, seq: 1 } });
    await wykonajCzyszczenie(db(), ['staly@firma.pl'], { potwierdzenie: 1, zerujNumeracje: true });
    const nowy = await nadajNumerFaktury(prisma() as never, teraz);
    expect(nowy).not.toBe(`VFV/${rok}/${mm}/0001`);
  });

  it('D: faktura w KSeF PROD w trybie OFFLINE (wystawiona, czeka na dosłanie) blokuje', async () => {
    const t = await klient('t-offline@test.pl');
    await prisma().invoice.create({
      data: { userId: t.id, number: 'VFV/2026/10/0009', amount: 45, ksefStatus: 'OFFLINE', ksefSrodowisko: 'prod', ksefTryb: 'OFFLINE24' } as never,
    });
    const p = await planCzyszczenia(db(), []);
    expect(p.blokady.length).toBeGreaterThan(0);
  });

  it('E: dokument z numerem z programu księgowego i wpłata Paynow — widoczne w podglądzie (do sprawdzenia, nie blokują: bywają sandbox)', async () => {
    const t = await klient('t-wplata@test.pl');
    await prisma().paynowPlatnosc.create({ data: { userId: t.id, kwotaMinor: 4500, status: 'CONFIRMED', paymentId: 'NOLV-1', meta: {} } });
    await prisma().invoice.create({
      data: { userId: t.id, number: 'VDR/2026/10/0001', amount: 45, rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY', externalInvoiceNumber: 'FV 12/10/2026', externalInvoiceAt: new Date() } as never,
    });
    const p = await planCzyszczenia(db(), []);
    expect(p.pieniadze).toMatchObject({ wplatyPaynowZl: '45.00', zNumeremKsiegowym: 1 });
    expect(opisPlanu(p)).toContain('z numerem z programu księgowego: 1');
  });

  it('F: domena u rejestratora (ACTIVE) — w podglądzie „do sprawdzenia” (sandbox OpenProvider bywa testowy)', async () => {
    const t = await klient('t-domena@test.pl');
    await prisma().domain.create({
      data: { userId: t.id, name: 'test-dominika-xyz.pl', status: 'ACTIVE', registrarProvider: 'x', registrarExternalId: 'ext-1', autoRenew: true } as never,
    });
    const p = await planCzyszczenia(db(), []);
    expect(p.uwagi).toEqual([expect.stringContaining('domena test-dominika-xyz.pl (ACTIVE) u rejestratora')]);
    expect(opisPlanu(p)).toContain('DO SPRAWDZENIA');
  });

  it('G: zwrócona w całości wpłata Paynow nie jest liczona jako „prawdziwa” w podglądzie', async () => {
    const t = await klient('t-zwrot@test.pl');
    await prisma().paynowPlatnosc.create({ data: { userId: t.id, kwotaMinor: 4500, status: 'CONFIRMED', paymentId: 'NOLV-2', meta: {}, zwroconoMinor: 4500 } });
    const p = await planCzyszczenia(db(), []);
    expect(p.pieniadze.wplatyPaynowZl).toBe('0.00');
  });

  it('H: konto na węźle powstałe między planem a transakcją (równoległy zakup) — blokada sprawdzana w transakcji', async () => {
    const plan = await utworzPlan();
    const w = await utworzWezel();
    const t = await klient('t-wyscig@test.pl');
    const sub = await prisma().subscription.create({ data: { userId: t.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE' } });
    const prawdziwa = db();
    // Symulacja: provisioning z działającego panelu zapisuje konto tuż po podglądzie liczonym w wykonajCzyszczenie.
    const zWyscigiem = new Proxy(prawdziwa, {
      get(cel, klucz, odb) {
        if (klucz === '$transaction') {
          return async (...args: unknown[]) => {
            await prisma().account.create({
              data: { userId: t.id, subscriptionId: sub.id, serverId: w.id, daUsername: 'twys1', domain: 'twys1.pl', status: 'ACTIVE' } as never,
            });
            return (cel.$transaction as (...a: unknown[]) => unknown).apply(cel, args);
          };
        }
        return Reflect.get(cel, klucz, odb);
      },
    }) as PrismaClient;
    await expect(wykonajCzyszczenie(zWyscigiem, [], { potwierdzenie: 1 })).rejects.toThrow();
    expect(await prisma().user.findUnique({ where: { id: t.id } })).not.toBeNull();
  });

  it('C2: po --zeruj-numeracje dokument w transakcji z wpłatą pada na duplikacie i licznik się nie rusza (każda kolejna próba też pada)', async () => {
    const teraz = new Date();
    const { rok, miesiac } = okresNumeracji(teraz);
    const mm = String(miesiac).padStart(2, '0');
    const staly = await klient('staly2@firma.pl');
    await klient('t2@test.pl');
    await prisma().invoice.create({ data: { userId: staly.id, number: `VFV/${rok}/${mm}/0001`, amount: 45 } as never });
    await prisma().invoiceCounter.create({ data: { series: 'VFV', year: rok, month: miesiac, seq: 1 } });
    await wykonajCzyszczenie(db(), ['staly2@firma.pl'], { potwierdzenie: 1, zerujNumeracje: true });
    const proba = () =>
      prisma().$transaction(async (tx) => {
        const numer = await nadajNumerFaktury(tx as never, teraz);
        await tx.invoice.create({ data: { userId: staly.id, number: numer, amount: 10 } as never });
        return numer;
      });
    const wyniki: string[] = [];
    for (let i = 0; i < 3; i++) wyniki.push(await proba().then((n) => n, (e: { code?: string }) => `BLAD ${e.code}`));
    expect(wyniki).toEqual([`VFV/${rok}/${mm}/0002`, `VFV/${rok}/${mm}/0003`, `VFV/${rok}/${mm}/0004`]);
  });

  it('argumenty CLI: spacja zamiast „=”, powtórzenie i literówka to błąd przed czymkolwiek', () => {
    expect([...sprawdzArgumenty(['--', '--zachowaj=a@b.pl,c@d.pl', '--wykonaj', '--potwierdz=3'])]).toEqual([
      ['zachowaj', 'a@b.pl,c@d.pl'],
      ['wykonaj', ''],
      ['potwierdz', '3'],
    ]);
    expect(() => sprawdzArgumenty(['--zachowaj', 'a@b.pl'])).toThrow('Użyj --zachowaj=<wartość>');
    expect(() => sprawdzArgumenty(['--zachowaj=a@b.pl', '--zachowaj=c@d.pl'])).toThrow('dwa razy');
    expect(() => sprawdzArgumenty(['--wykonja'])).toThrow('Nieznany argument: --wykonja');
    expect(() => sprawdzArgumenty(['a@b.pl'])).toThrow('Nieznany argument');
  });
});

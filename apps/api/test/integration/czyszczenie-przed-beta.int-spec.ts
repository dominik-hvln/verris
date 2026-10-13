import { PrismaClient } from '@verris/database';
import { planCzyszczenia, wykonajCzyszczenie, opisPlanu } from '../../src/cli/czyszczenie-przed-beta.plan.js';
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

  it('--zeruj-numeracje: liczniki serii usunięte (nowe dokumenty od 0001)', async () => {
    await dane();
    await wykonajCzyszczenie(db(), [], { potwierdzenie: 3, zerujNumeracje: true });
    expect(await prisma().invoiceCounter.count()).toBe(0);
    expect(await prisma().user.count({ where: { role: 'USER' } })).toBe(0);
  });
});

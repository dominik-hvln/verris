import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AddonService } from '../../src/addons/addon.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — sklep dodatków z portfela (P-8) na prawdziwej bazie: obciążenie raz, jedno zlecenie dla
 * zespołu na jedną decyzję, zwrot gdy realizacja padnie, dokupienie priorytetu przedłuża okres.
 */

const DZIEN = 86_400_000;
let zgloszenia = 0;
let zgloszeniaPadaja = false;

function sklep() {
  const p = prisma() as never;
  const tickets = {
    create: async () => {
      await new Promise((r) => setTimeout(r, 20)); // realne założenie zgłoszenia trwa — wyścig ma okno
      if (zgloszeniaPadaja) throw new Error('baza zgłoszeń niedostępna');
      zgloszenia += 1;
      return { id: `t-${zgloszenia}` };
    },
  };
  return new AddonService(p, new AuditService(p), new WalletLedgerService(p), tickets as never);
}

let n = 0;
const klient = (saldo: number) => {
  n += 1;
  return prisma().user.create({ data: { email: `dodatki-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const zakupy = (userId: string) => prisma().purchasedAddon.findMany({ where: { userId } });

describe('X-04 dodatki z portfela', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zgloszenia = 0;
    zgloszeniaPadaja = false;
  });
  afterAll(rozlacz);

  it('priorytet: 49 zł z portfela, aktywny 30 dni', async () => {
    const u = await klient(100);
    await sklep().purchase(u.id, 'priority_support_30d', undefined, 'k1');
    expect(await saldo(u.id)).toBe(51);
    const x = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(x.prioritySupport).toBe(true);
    expect(x.prioritySupportUntil!.getTime() - Date.now()).toBeGreaterThan(29.9 * DZIEN);
    expect((await zakupy(u.id)).map((z) => z.status)).toEqual(['APPLIED']);
  });

  it('dokupienie priorytetu w trakcie przedłuża okres, zamiast liczyć od dziś', async () => {
    const u = await klient(200);
    const koniec = new Date(Date.now() + 20 * DZIEN);
    await prisma().user.update({ where: { id: u.id }, data: { prioritySupport: true, prioritySupportUntil: koniec } });

    await sklep().purchase(u.id, 'priority_support_30d', undefined, 'k2');

    const x = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(x.prioritySupportUntil!.getTime()).toBe(koniec.getTime() + 30 * DZIEN);
  });

  it('podwójne kliknięcie zlecenia: jedno obciążenie, jedno zgłoszenie, jeden zakup', async () => {
    const u = await klient(500);
    const s = sklep();
    const wyniki = await Promise.all([
      s.purchase(u.id, 'manual_setup', undefined, 'klik'),
      s.purchase(u.id, 'manual_setup', undefined, 'klik'),
    ]);
    expect(wyniki.filter((w) => 'duplikat' in w)).toHaveLength(1);
    expect(await saldo(u.id)).toBe(401);
    expect(zgloszenia).toBe(1);
    expect(await zakupy(u.id)).toHaveLength(1);
  });

  it('brak środków: odmowa bez zgłoszenia; po doładowaniu ten sam klucz kupuje normalnie', async () => {
    const u = await klient(10);
    await expect(sklep().purchase(u.id, 'manual_setup', undefined, 'k3')).rejects.toThrow();
    expect(zgloszenia).toBe(0);
    expect(await zakupy(u.id)).toHaveLength(0);

    await prisma().user.update({ where: { id: u.id }, data: { walletBalance: 200 } });
    const r = await sklep().purchase(u.id, 'manual_setup', undefined, 'k3');
    expect('duplikat' in r).toBe(false);
    expect(await saldo(u.id)).toBe(101);
    expect(zgloszenia).toBe(1);
  });

  it('założenie zgłoszenia pada: pełny zwrot, brak zakupu; ponowienie płaci raz i działa', async () => {
    const u = await klient(200);
    zgloszeniaPadaja = true;
    await expect(sklep().purchase(u.id, 'dedicated_ip', undefined, 'k4')).rejects.toThrow('niedostępna');
    expect(await saldo(u.id)).toBe(200);
    expect(await zakupy(u.id)).toHaveLength(0);

    zgloszeniaPadaja = false;
    await sklep().purchase(u.id, 'dedicated_ip', undefined, 'k4');
    expect(await saldo(u.id)).toBe(175);
    expect((await zakupy(u.id)).map((z) => z.status)).toEqual(['QUEUED']);
  });

  it('cudza usługa w zamówieniu: 404 bez obciążenia', async () => {
    const u = await klient(200);
    const obcy = await klient(0);
    const plan = await prisma().plan.create({ data: { slug: `p-${Date.now()}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 45, priceYearly: 399 } });
    const cudza = await prisma().subscription.create({ data: { userId: obcy.id, planId: plan.id, interval: 'MONTH', priceAmount: 45 } });
    await expect(sklep().purchase(u.id, 'dedicated_ip', cudza.id, 'k5')).rejects.toThrow('nie istnieje');
    expect(await saldo(u.id)).toBe(200);
  });
});

describe('F3.5 — dodatki dodawane przez obsługę', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zgloszenia = 0;
    zgloszeniaPadaja = false;
  });
  afterAll(rozlacz);

  async function usluga(userId: string) {
    const plan = await prisma().plan.create({ data: { slug: `p-${Date.now()}-${Math.random()}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 45, priceYearly: 399 } });
    return prisma().subscription.create({ data: { userId, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE' } });
  }
  const op = async (role: 'STAFF' | 'ADMIN' = 'STAFF') => {
    n += 1;
    const u = await prisma().user.create({ data: { email: `dodatki-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role } });
    return { userId: u.id, role };
  };
  const POWOD = 'Klient zamówił w zgłoszeniu konfigurację.';

  it('gratis: bez obciążenia, rekord 0 zł, zlecenie dla zespołu; ten sam klucz drugi raz — bez drugiego dodatku', async () => {
    const k = await klient(0);
    const u = await usluga(k.id);
    const o = await op();
    const r = await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: POWOD, klucz: 'wniosek:w1' });
    expect(r).toMatchObject({ status: 'QUEUED' });
    expect(await saldo(k.id)).toBe(0);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);
    expect((await zakupy(k.id)).map((z) => Number(z.amount))).toEqual([0]);
    expect(zgloszenia).toBe(1);
    const drugi = await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: POWOD, klucz: 'wniosek:w1' });
    expect('duplikat' in drugi).toBe(true);
    expect(zgloszenia).toBe(1);
    // D3 — klient widzi dodatek z „obsługa Verris”; dziennik zespołu z powodem (raz).
    const akt = await new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(k.id);
    expect(akt.events.find((e) => e.action === 'ADDON_PURCHASED')).toMatchObject({ actor: 'obsługa Verris', context: 'Konfiguracja przez specjalistę' });
    expect(await prisma().auditLog.count({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.id } })).toBe(1);
  });

  it('z portfela klienta: tylko z numerem jego zgłoszenia; obciążenie jak przy zakupie klienta; brak środków — nic', async () => {
    const k = await klient(100);
    const u = await usluga(k.id);
    const o = await op();
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD })).rejects.toMatchObject({ status: 400 });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'Proszę o IP', message: 'x' } });
    await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD, zgloszenie: zgl.id, klucz: 'panel:abc12345' });
    expect(await saldo(k.id)).toBe(75);
    const tx = await prisma().walletTransaction.findFirstOrThrow({ where: { userId: k.id } });
    expect(tx).toMatchObject({ type: 'CHARGE_USAGE', description: 'Dodatek: Dedykowane IP' });
    const ubogi = await klient(10);
    const u2 = await usluga(ubogi.id);
    const zgl2 = await prisma().ticket.create({ data: { userId: ubogi.id, subject: 'IP', message: 'x' } });
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: u2.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD, zgloszenie: zgl2.id })).rejects.toThrow();
    expect(await zakupy(ubogi.id)).toHaveLength(0);
    expect(zgloszenia).toBe(1);
  });

  it('STAFF nie dodaje do usługi konta zespołu; zgłoszenie innego klienta — 400; powód obowiązkowy', async () => {
    const zespol = await prisma().user.create({ data: { email: `dodatki-zespol-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const u = await usluga(zespol.id);
    const o = await op();
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: POWOD })).rejects.toMatchObject({ status: 403 });
    const k = await klient(0);
    const uk = await usluga(k.id);
    const obcy = await klient(0);
    const obce = await prisma().ticket.create({ data: { userId: obcy.id, subject: 'x', message: 'x' } });
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: uk.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: POWOD, zgloszenie: obce.id })).rejects.toMatchObject({ status: 400 });
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: uk.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: 'krótko' })).rejects.toMatchObject({ status: 400 });
    expect(zgloszenia).toBe(0);
  });

  it('przegląd F3.5: usługa zakończona — bez dodatku i bez obciążenia także bezpośrednio (nie tylko przez wniosek)', async () => {
    const k = await klient(100);
    const u = await usluga(k.id);
    await prisma().subscription.update({ where: { id: u.id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, subject: 'IP', message: 'x' } });
    const admin = await op('ADMIN');
    await expect(
      sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: admin, powod: POWOD, zgloszenie: zgl.id }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await saldo(k.id)).toBe(100);
    expect(await zakupy(k.id)).toHaveLength(0);
    expect(zgloszenia).toBe(0);
  });
});

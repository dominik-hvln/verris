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

  it('dokupienie priorytetu w trakcie: bez zgody 409 (nic nie pobrane), z „Przedłuż” — od końca okresu, nie od dziś', async () => {
    const u = await klient(200);
    const koniec = new Date(Date.now() + 20 * DZIEN);
    await prisma().user.update({ where: { id: u.id }, data: { prioritySupport: true, prioritySupportUntil: koniec } });

    // Weryfikacja 11.10 — wcześniej drugi zakup aktywnego dodatku przechodził po cichu (d3: dwa takie same wpisy).
    await expect(sklep().purchase(u.id, 'priority_support_30d', undefined, 'k2')).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/jest już aktywne do .* przedłużyć o 30 dni/),
    });
    expect(await saldo(u.id)).toBe(200);
    expect(await zakupy(u.id)).toEqual([]);

    // Ten sam klucz po odmowie jest wolny — świadome przedłużenie płaci raz i liczy od końca okresu.
    const r = await sklep().purchase(u.id, 'priority_support_30d', undefined, 'k2', true);
    expect(r).toMatchObject({ przedluzenie: true, note: expect.stringMatching(/^Przedłużone do /) });
    const x = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(x.prioritySupportUntil!.getTime()).toBe(koniec.getTime() + 30 * DZIEN);
    expect(await saldo(u.id)).toBe(151);
    expect((await zakupy(u.id)).map((z) => z.name)).toEqual(['Priorytetowe wsparcie (30 dni) — przedłużenie']);
    // Powtórzenie tej samej decyzji (podwójny klik) — duplikat, nie odmowa i nie drugie obciążenie.
    expect(await sklep().purchase(u.id, 'priority_support_30d', undefined, 'k2', true)).toMatchObject({ duplikat: true });
    expect(await saldo(u.id)).toBe(151);
  });

  it('weryfikacja 11.10: historia — priorytet po końcu okresu „zakończony”, nie „aktywny”', async () => {
    const u = await klient(100);
    await sklep().purchase(u.id, 'priority_support_30d', undefined, 'h1');
    expect((await sklep().overview(u.id)).purchased.map((p) => p.status)).toEqual(['APPLIED']);
    await prisma().user.update({ where: { id: u.id }, data: { prioritySupportUntil: new Date(Date.now() - DZIEN) } });
    expect((await sklep().overview(u.id)).purchased.map((p) => p.status)).toEqual(['EXPIRED']);
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

    // Weryfikacja 11.10 (D3) — wpis na osi „Co się działo” karty usługi (raz, duplikat nie dubluje), bez powodu i operatora.
    const zdarzenia = await prisma().subscriptionEvent.findMany({ where: { subscriptionId: u.id } });
    expect(zdarzenia.map((e) => [e.type, e.details])).toEqual([
      ['ADDON_ADDED', { source: 'OPERATOR', slug: 'manual_setup', name: 'Konfiguracja przez specjalistę', gratis: true }],
    ]);
  });

  it('weryfikacja 11.10 (d3): obsługa nie doda drugi raz aktywnego priorytetu; przedłużenie świadome, widoczne dla klienta', async () => {
    const k = await klient(0);
    const u = await usluga(k.id);
    const o = await op('ADMIN');
    await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'priority_support_30d', platnosc: 'GRATIS', operator: o, powod: POWOD, klucz: 'panel:p1aaaaaa' });
    const do1 = (await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).prioritySupportUntil!;

    await expect(
      sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'priority_support_30d', platnosc: 'GRATIS', operator: o, powod: POWOD, klucz: 'panel:p2bbbbbb' }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await zakupy(k.id)).length).toBe(1);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).prioritySupportUntil!.getTime()).toBe(do1.getTime());

    const r = await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'priority_support_30d', platnosc: 'GRATIS', operator: o, powod: POWOD, klucz: 'panel:p2bbbbbb', przedluz: true });
    expect(r).toMatchObject({ przedluzenie: true });
    const do2 = (await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).prioritySupportUntil!;
    expect(do2.getTime()).toBe(do1.getTime() + 30 * DZIEN);
    expect((await zakupy(k.id)).map((z) => z.name).sort()).toEqual(['Priorytetowe wsparcie (30 dni)', 'Priorytetowe wsparcie (30 dni) — przedłużenie']);
    const zdarzenia = await prisma().subscriptionEvent.findMany({ where: { subscriptionId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(zdarzenia.map((e) => (e.details as Record<string, unknown>).przedluzenie ?? false)).toEqual([false, true]);
    expect((zdarzenia[1]!.details as Record<string, unknown>).aktywnyDo).toBe(do2.toISOString());
    const zespol = await prisma().auditLog.findMany({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.id }, orderBy: { createdAt: 'asc' } });
    expect(zespol.map((w) => (w.details as Record<string, unknown>).akcja)).toEqual(['dodatek', 'dodatek-przedluzenie']);
  });

  it('z portfela klienta: tylko z numerem jego zgłoszenia; obciążenie jak przy zakupie klienta; brak środków — nic', async () => {
    const k = await klient(100);
    const u = await usluga(k.id);
    const o = await op();
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD })).rejects.toMatchObject({ status: 400 });
    // Audyt Fali 3 — zgłoszenie założone przez obsługę „w imieniu” albo z maila to nie zamówienie klienta: 403, bez obciążenia.
    for (const [zrodlo, openedByStaffId] of [['OBSLUGA', o.userId], ['EMAIL', null]] as const) {
      const nieKlienta = await prisma().ticket.create({ data: { userId: k.id, zrodlo, openedByStaffId, subject: 'IP', message: 'proszę o IP' } });
      await expect(sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD, zgloszenie: nieKlienta.id })).rejects.toMatchObject({ status: 403 });
    }
    expect(await saldo(k.id)).toBe(100);
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Proszę o IP', message: 'x' } });
    await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: o, powod: POWOD, zgloszenie: zgl.id, klucz: 'panel:abc12345' });
    expect(await saldo(k.id)).toBe(75);
    const tx = await prisma().walletTransaction.findFirstOrThrow({ where: { userId: k.id } });
    expect(tx).toMatchObject({ type: 'CHARGE_USAGE', description: 'Dodatek: Dedykowane IP' });
    const ubogi = await klient(10);
    const u2 = await usluga(ubogi.id);
    const zgl2 = await prisma().ticket.create({ data: { userId: ubogi.id, zrodlo: 'PANEL', subject: 'IP', message: 'x' } });
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
    const obce = await prisma().ticket.create({ data: { userId: obcy.id, zrodlo: 'PANEL', subject: 'x', message: 'x' } });
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: uk.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: POWOD, zgloszenie: obce.id })).rejects.toMatchObject({ status: 400 });
    await expect(sklep().dodajPrzezOperatora({ subscriptionId: uk.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: o, powod: 'krótko' })).rejects.toMatchObject({ status: 400 });
    expect(zgloszenia).toBe(0);
  });

  it('przegląd F3.5: usługa zakończona — bez dodatku i bez obciążenia także bezpośrednio (nie tylko przez wniosek)', async () => {
    const k = await klient(100);
    const u = await usluga(k.id);
    await prisma().subscription.update({ where: { id: u.id }, data: { status: 'CANCELED', canceledAt: new Date() } });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'IP', message: 'x' } });
    const admin = await op('ADMIN');
    await expect(
      sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: admin, powod: POWOD, zgloszenie: zgl.id }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await saldo(k.id)).toBe(100);
    expect(await zakupy(k.id)).toHaveLength(0);
    expect(zgloszenia).toBe(0);
  });
});

describe('audyt Fali 3 — dodatek z portfela do zawieszonej usługi', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zgloszenia = 0;
    zgloszeniaPadaja = false;
  });
  afterAll(rozlacz);

  it('z portfela klienta do zawieszonej — 400 bez obciążenia i bez zlecenia; gratis — tak', async () => {
    const k = await klient(100);
    const plan = await prisma().plan.create({ data: { slug: `p-${Date.now()}-${Math.random()}`, name: 'P', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 1024, priceMonthly: 45, priceYearly: 399 } });
    const u = await prisma().subscription.create({ data: { userId: k.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'SUSPENDED' } });
    const admin = await prisma().user.create({ data: { email: `dodatki-f3-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'IP', message: 'x' } });
    const POWOD = 'Klient zamówił w zgłoszeniu dedykowane IP.';
    await expect(
      sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'dedicated_ip', platnosc: 'PORTFEL', operator: { userId: admin.id, role: 'ADMIN' }, powod: POWOD, zgloszenie: zgl.id }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await saldo(k.id)).toBe(100);
    expect(await zakupy(k.id)).toHaveLength(0);
    expect(zgloszenia).toBe(0);
    await sklep().dodajPrzezOperatora({ subscriptionId: u.id, slug: 'manual_setup', platnosc: 'GRATIS', operator: { userId: admin.id, role: 'ADMIN' }, powod: POWOD });
    expect(await saldo(k.id)).toBe(100);
    expect(await zakupy(k.id)).toHaveLength(1);
  });
});

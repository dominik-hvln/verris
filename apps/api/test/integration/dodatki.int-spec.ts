import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AddonService } from '../../src/addons/addon.service.js';
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

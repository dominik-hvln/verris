import { VpsStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { VpsService } from '../../src/vps/vps.service.js';
import { VpsRenewalScheduler } from '../../src/vps/vps-renewal.scheduler.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — VPS z portfela (Q-06) na prawdziwej bazie: zakup, zwrot przy błędzie Hetznera,
 * odnowienie, wstrzymanie i usunięcie za brak płatności. Hetzner jest atrapą.
 */

const DZIEN = 86_400_000;
const hetznerLog: string[] = [];
let hetznerPada = false;
const hetzner = {
  isConfigured: () => true,
  createServer: async () => {
    if (hetznerPada) throw new Error('Hetzner: brak zasobów w lokalizacji');
    return { server: { id: 42, public_net: { ipv4: { ip: '1.2.3.4' } } }, rootPassword: 'x' };
  },
  powerOn: async (id: string) => void hetznerLog.push(`on:${id}`),
  powerOff: async (id: string) => void hetznerLog.push(`off:${id}`),
  deleteServer: async (id: string) => void hetznerLog.push(`delete:${id}`),
};
const noop = { send: async () => ({}), get: () => undefined, encrypt: (v: string) => `enc:${v}` };

function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  return {
    vps: new VpsService(p, noop as never, audit, ledger, hetzner as never, noop as never, noop as never),
    odnowienia: new VpsRenewalScheduler(p, ledger, hetzner as never, noop as never, audit, noop as never),
  };
}

let n = 0;
async function klient(saldo: number) {
  n += 1;
  return prisma().user.create({ data: { email: `vps-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
}
const plan = () =>
  prisma().vpsPlan.create({
    data: { slug: `vps-${Date.now()}-${n}`, name: 'VPS S', hetznerServerType: 'cx22', vcpu: 2, ramGb: 4, diskGb: 40, priceMonthly: 30 },
  });
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
/** Działający VPS z okresem zakończonym `dniTemu` dni temu. */
async function vpsPoOkresie(userId: string, planId: string, dniTemu: number, status: VpsStatus = VpsStatus.RUNNING) {
  return prisma().vpsInstance.create({
    data: { userId, planId, name: 'srv', status, priceMonthly: 30, hetznerServerId: `h-${n}`, currentPeriodEnd: new Date(Date.now() - dniTemu * DZIEN) },
  });
}

describe('X-04 VPS z portfela', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "VpsPlan" CASCADE');
    hetznerLog.length = 0;
    hetznerPada = false;
  });
  afterAll(rozlacz);

  it('zakup: miesiąc z portfela, VPS działa', async () => {
    const u = await klient(100);
    const p = await plan();
    const r = await uslugi().vps.order(u.id, { planId: p.id, immediatePerformanceConsent: true } as never);
    expect(r.status).toBe(VpsStatus.RUNNING);
    expect(await saldo(u.id)).toBe(70);
  });

  it('brak środków: odmowa i żadnego „zakładanego” VPS na liście', async () => {
    const u = await klient(5);
    const p = await plan();
    await expect(uslugi().vps.order(u.id, { planId: p.id, immediatePerformanceConsent: true } as never)).rejects.toThrow();
    expect(await prisma().vpsInstance.count({ where: { userId: u.id } })).toBe(0);
  });

  it('Hetzner odmawia: pełny zwrot, VPS w stanie błędu', async () => {
    const u = await klient(100);
    const p = await plan();
    hetznerPada = true;
    await expect(uslugi().vps.order(u.id, { planId: p.id, immediatePerformanceConsent: true } as never)).rejects.toThrow('Hetzner');
    expect(await saldo(u.id)).toBe(100);
    expect((await prisma().vpsInstance.findFirstOrThrow({ where: { userId: u.id } })).status).toBe(VpsStatus.ERROR);
  });

  it('odnowienie: obciążenie raz, okres +30 dni; drugi przebieg tego samego dnia nic nie pobiera', async () => {
    const u = await klient(100);
    const p = await plan();
    const v = await vpsPoOkresie(u.id, p.id, 0);
    await uslugi().odnowienia.tick();
    await uslugi().odnowienia.tick();
    expect(await saldo(u.id)).toBe(70);
    const po = await prisma().vpsInstance.findUniqueOrThrow({ where: { id: v.id } });
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 29 * DZIEN);
  });

  it('brak środków: wstrzymanie, a klient nie włączy go sam z panelu', async () => {
    const u = await klient(0);
    const p = await plan();
    const v = await vpsPoOkresie(u.id, p.id, 1);
    await uslugi().odnowienia.tick();
    expect((await prisma().vpsInstance.findUniqueOrThrow({ where: { id: v.id } })).status).toBe(VpsStatus.STOPPED);

    await expect(uslugi().vps.power(u.id, v.id, 'on')).rejects.toThrow('braku środków');
    expect(hetznerLog.filter((x) => x.startsWith('on:'))).toEqual([]);

    // Po doładowaniu najbliższe odnowienie włącza go z powrotem.
    await prisma().user.update({ where: { id: u.id }, data: { walletBalance: 50 } });
    await uslugi().odnowienia.tick();
    expect((await prisma().vpsInstance.findUniqueOrThrow({ where: { id: v.id } })).status).toBe(VpsStatus.RUNNING);
    expect(await saldo(u.id)).toBe(20);
  });

  it('po 7 dniach bez płatności: serwer usunięty u Hetznera, VPS oznaczony jako usunięty', async () => {
    const u = await klient(0);
    const p = await plan();
    const v = await vpsPoOkresie(u.id, p.id, 8, VpsStatus.STOPPED);
    await uslugi().odnowienia.tick();
    expect((await prisma().vpsInstance.findUniqueOrThrow({ where: { id: v.id } })).status).toBe(VpsStatus.DELETED);
    expect(hetznerLog).toContain(`delete:${v.hetznerServerId}`);
  });
});

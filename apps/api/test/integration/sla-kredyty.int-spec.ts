import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { SlaCreditScheduler } from '../../src/billing/sla-credit.scheduler.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — rekompensaty SLA (§15) na prawdziwej bazie. Sierpień 2026 = 44 640 min.
 * 14 h przestoju → 98,12% → 25% opłaty (11,25 zł przy 45 zł/mies.).
 */

const TERAZ = new Date('2026-09-02T03:00:00Z');
const H = 3_600_000;
let portfelPada = false;

function scheduler() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const portfel = {
    credit: (x: never) => (portfelPada ? Promise.reject(new Error('baza chwilowo niedostępna')) : ledger.credit(x)),
  };
  const ustawienia = { getSlaCreditPolicy: async () => ({ enabled: true, graceMinutes: 5, maintenanceCapMinutes: 480 }) };
  const noop = { create: async () => ({}), send: async () => ({}), get: () => undefined };
  return new SlaCreditScheduler(p, portfel as never, noop as never, ustawienia as never, new AuditService(p), noop as never, noop as never);
}

async function usluga() {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  await prisma().subscription.update({
    where: { id: k.subscription.id },
    data: { status: SubscriptionStatus.ACTIVE, createdAt: new Date('2026-06-01T00:00:00Z') },
  });
  const sonda = await prisma().serviceProbe.create({ data: { serverId: wezel.id, kind: 'HTTP', target: 'https://x.test' } as never });
  return { wezel, sonda, ...k };
}

const przestoj = (probeId: string, od: string, godzin: number) =>
  prisma().probeIncident.create({
    data: { probeId, severity: 'MAJOR', status: 'RESOLVED', title: 'awaria', startedAt: new Date(od), resolvedAt: new Date(new Date(od).getTime() + godzin * H) },
  });
const okno = (serverId: string, od: string, godzin: number, zapowiedzGodzinWczesniej: number) =>
  prisma().maintenanceWindow.create({
    data: {
      serverId, title: 'prace', status: 'COMPLETED',
      scheduledStart: new Date(od), scheduledEnd: new Date(new Date(od).getTime() + godzin * H),
      createdAt: new Date(new Date(od).getTime() - zapowiedzGodzinWczesniej * H),
    },
  });
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);

describe('X-04 rekompensaty SLA', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    portfelPada = false;
  });
  afterAll(rozlacz);

  it('14 h przestoju: 25% opłaty na portfel raz, ponowny przebieg nic nie dopisuje', async () => {
    const u = await usluga();
    await przestoj(u.sonda.id, '2026-08-10T00:00:00Z', 14);

    await scheduler().run(TERAZ);
    await scheduler().run(TERAZ);

    expect(await saldo(u.user.id)).toBe(11.25);
    expect(await prisma().slaCredit.count({ where: { subscriptionId: u.subscription.id } })).toBe(1);
  });

  it('prace zapowiedziane 72 h wcześniej nie liczą się do przestoju', async () => {
    const u = await usluga();
    await okno(u.wezel.id, '2026-08-10T00:00:00Z', 6, 72);
    await przestoj(u.sonda.id, '2026-08-10T00:00:00Z', 6);

    await scheduler().run(TERAZ);

    expect(await saldo(u.user.id)).toBe(0);
  });

  it('okno założone godzinę przed pracami nie jest zapowiedzią (§15 ust. 7) — przestój się liczy', async () => {
    const u = await usluga();
    await okno(u.wezel.id, '2026-08-10T00:00:00Z', 14, 1);
    await przestoj(u.sonda.id, '2026-08-10T00:00:00Z', 14);

    await scheduler().run(TERAZ);

    expect(await saldo(u.user.id)).toBe(11.25);
  });

  it('prace przedłużone ponad zapowiedź: nadwyżka to zwykły przestój', async () => {
    const u = await usluga();
    // Zapowiedziane 2 h, trwały 9 h — 7 h ponad zapowiedź = 420 min → 99,06% → próg 5% (2,25 zł).
    const w = await okno(u.wezel.id, '2026-08-10T00:00:00Z', 2, 72);
    await prisma().maintenanceWindow.update({ where: { id: w.id }, data: { startedAt: new Date('2026-08-10T00:00:00Z'), completedAt: new Date('2026-08-10T09:00:00Z') } });
    await przestoj(u.sonda.id, '2026-08-10T00:00:00Z', 9);

    await scheduler().run(TERAZ);

    expect(await saldo(u.user.id)).toBe(2.25);
  });

  it('uznanie portfela pada: miesiąc nie zostaje „zamknięty” bez pieniędzy — kolejny przebieg wypłaca', async () => {
    const u = await usluga();
    await przestoj(u.sonda.id, '2026-08-10T00:00:00Z', 14);

    portfelPada = true;
    await scheduler().run(TERAZ);
    expect(await saldo(u.user.id)).toBe(0);

    portfelPada = false;
    await scheduler().run(TERAZ);
    expect(await saldo(u.user.id)).toBe(11.25);
  });
});

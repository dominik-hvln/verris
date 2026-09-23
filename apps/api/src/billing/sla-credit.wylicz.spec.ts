import { Prisma } from '@verris/database';
import { SlaCreditScheduler } from './sla-credit.scheduler';

/** N-16 — podgląd liczy to samo co wypłata i niczego nie zapisuje. */
function setup(enabled: boolean) {
  const writes: string[] = [];
  const sub = {
    id: 's1',
    userId: 'u1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    interval: 'MONTH',
    priceAmount: new Prisma.Decimal('45.00'),
    currency: 'PLN',
    plan: { name: 'Starter' },
    account: { domain: 'piekarnia.pl', serverId: 'srv1' },
    user: { email: 'a@b.pl', firstName: 'Anna', anonymizedAt: null },
  };
  const prisma = {
    subscription: { findMany: jest.fn().mockResolvedValue([sub]) },
    // sierpień 2026 = 44 640 min; 14 h przestoju = 840 min → 98,12% → próg 25%
    probeIncident: {
      findMany: jest.fn().mockResolvedValue([
        { startedAt: new Date('2026-08-10T00:00:00Z'), resolvedAt: new Date('2026-08-10T14:00:00Z'), probe: { serverId: 'srv1' } },
      ]),
    },
    maintenanceWindow: { findMany: jest.fn().mockResolvedValue([]) },
    slaCredit: { create: jest.fn().mockImplementation(async () => writes.push('sla')) },
  };
  const wallet = { credit: jest.fn().mockImplementation(async () => (writes.push('wallet'), { balanceAfter: '100.00' })) };
  const settings = { getSlaCreditPolicy: jest.fn().mockResolvedValue({ enabled, graceMinutes: 5, maintenanceCapMinutes: 480 }) };
  const noop = { record: jest.fn(), create: jest.fn(), send: jest.fn().mockResolvedValue(undefined), get: () => undefined };
  const s = new SlaCreditScheduler(prisma as never, wallet as never, noop as never, settings as never, noop as never, noop as never, noop as never);
  return { s, writes };
}

const now = new Date('2026-09-02T03:00:00Z');

describe('N-16 — podgląd i wypłata SLA', () => {
  it('podgląd: poprzedni miesiąc, próg z §15, kwota od opłaty miesięcznej, zero zapisów', async () => {
    const { s, writes } = setup(false);
    const r = await s.wylicz(now);
    expect(r.okres).toBe('2026-08');
    expect(r.pozycje).toHaveLength(1);
    expect(r.pozycje[0].tierPercent).toBe(25);
    expect(r.pozycje[0].amount.toFixed(2)).toBe('11.25');
    expect(writes).toEqual([]);
  });

  it('wyłączona flaga: run() niczego nie wypłaca', async () => {
    const { s, writes } = setup(false);
    await s.run(now);
    expect(writes).toEqual([]);
  });

  it('włączona flaga: najpierw rekord SLA (unikat), potem portfel', async () => {
    const { s, writes } = setup(true);
    await s.run(now);
    expect(writes).toEqual(['sla', 'wallet']);
  });
});

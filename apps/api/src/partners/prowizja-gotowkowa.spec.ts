import { Prisma } from '@verris/database';
import { PartnerCommissionScheduler } from './partner-commission.scheduler.js';

/**
 * Audyt bezpieczeństwa 13.10: prowizja partnera i bonus progu (wypłacalne przelewem) naliczane były od obciążeń
 * opłaconych kredytem niegotówkowym (promocja, uznanie obsługi) — polecony bez jednej złotówki wpłaty generował
 * partnerowi realne pieniądze, a bonus progu był do wypłaty od razu.
 */
describe('Prowizja partnera — tylko od gotówki poleconego', () => {
  function stanowisko(o: { wplaty: number; wykorzystane?: number; obciazenie: number }) {
    const utworzone: Array<Record<string, unknown>> = [];
    const prisma = {
      walletTransaction: {
        findMany: vi.fn(async () => [
          { id: 'tx1', userId: 'pol', amount: new Prisma.Decimal(-o.obciazenie), currency: 'PLN', createdAt: new Date(), subscriptionId: null },
        ]),
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal(o.wplaty) } })),
      },
      partnerCommission: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async (a: { where: { kind?: string } }) =>
          a.where.kind === 'RECURRING_PCT' ? utworzone.filter((u) => new Prisma.Decimal(u.baseAmount as Prisma.Decimal).gt(0)).map(() => ({ referredUserId: 'pol' })) : [],
        ),
        findFirst: vi.fn(async () => null),
        aggregate: vi.fn(async () => ({ _sum: { baseAmount: new Prisma.Decimal(o.wykorzystane ?? 0) } })),
        count: vi.fn(async () => 0),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          utworzone.push(a.data);
          return { id: String(utworzone.length) };
        }),
      },
      user: {
        findUnique: vi.fn(async () => ({ referredByUserId: 'partner', resellerOwnerId: null })),
      },
      referralProgramEnrollment: { findUnique: vi.fn(async () => ({ status: 'APPROVED' })) },
    };
    const settings = {
      getPartnerProgram: async () => ({ enabled: true, commissionPct: 10, holdDays: 30, freeHostingThreshold: 1, freeHostingCredit: 50 }),
    };
    const svc = new PartnerCommissionScheduler(prisma as never, settings as never);
    return { svc, utworzone };
  }

  it('polecony bez wpłat (opłata z kredytu promocyjnego) → brak prowizji i bonusu', async () => {
    const s = stanowisko({ wplaty: 0, obciazenie: 100 });
    await s.svc.run();
    expect(s.utworzone).toEqual([]);
  });

  it('wpłacił 40 z opłaty 100 → prowizja od 40; bonus progu z karencją (PENDING)', async () => {
    const s = stanowisko({ wplaty: 40, obciazenie: 100 });
    await s.svc.run();
    const prowizja = s.utworzone.find((u) => u.kind === 'RECURRING_PCT')!;
    expect(String(prowizja.baseAmount)).toBe('40');
    expect(String(prowizja.amount)).toBe('4');
    const bonus = s.utworzone.find((u) => u.kind === 'MILESTONE_BONUS')!;
    expect(bonus.status).toBe('PENDING');
    expect((bonus.availableAt as Date).getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
  });

  it('gotówka już wykorzystana przez wcześniejsze prowizje → kolejna opłata bez prowizji', async () => {
    const s = stanowisko({ wplaty: 100, wykorzystane: 100, obciazenie: 50 });
    await s.svc.run();
    expect(s.utworzone.filter((u) => u.kind === 'RECURRING_PCT')).toEqual([]);
  });
});

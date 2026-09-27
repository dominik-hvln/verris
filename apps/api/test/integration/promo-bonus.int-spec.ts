import { Prisma, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/** Bonus procentowy do doładowania: dwa checkouty z tym samym kodem naraz — bonus raz. */
describe('Promo: bonus do doładowania', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('dwa webhooki z różnych sesji naraz: jedno uznanie, jedno użycie kodu', async () => {
    const u = await prisma().user.create({ data: { email: `pr-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: new Prisma.Decimal(100) } });
    const kod = await prisma().promoCode.create({ data: { code: `BONUS${Date.now()}`, kind: 'PERCENT_BONUS', value: new Prisma.Decimal(10) } as never });
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    const s = new PromoService(p, ledger, new AuditService(p), { send: async () => ({}) } as never, { get: () => undefined } as never);
    await Promise.all(['cs_1', 'cs_2'].map((sessionId) =>
      s.applyPercentBonusForTopup({ userId: u.id, promoCodeId: kod.id, bonusAmount: 10, relatedWalletTxId: 'x', sessionId }).catch(() => undefined)));
    expect(await prisma().walletTransaction.count({ where: { userId: u.id, type: WalletTxType.PROMO_CREDIT } })).toBe(1);
    const po = await prisma().promoCode.findUniqueOrThrow({ where: { id: kod.id } });
    expect((po as unknown as { redemptionCount: number }).redemptionCount).toBe(1);
  });
});

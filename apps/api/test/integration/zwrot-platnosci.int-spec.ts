import { Prisma, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Zwrot i spór (chargeback) do tej samej płatności obsłużone równocześnie: z portfela schodzi
 * kwota doładowania raz. Wcześniej oba zdarzenia widziały „nic nie cofnięto” i oba ściągały całość.
 */
function billing() {
  const p = prisma() as never;
  return new BillingService(p, new WalletLedgerService(p), null as never, new AuditService(p), { get: () => undefined } as never,
    null as never, null as never, null as never, null as never, null as never, null as never);
}
type Zdarzenie = { id: string; type: string; data: { object: Record<string, unknown> } };
const zwrot = (b: BillingService, e: Zdarzenie) =>
  (b as unknown as { handleZwrotPlatnosci: (e: Zdarzenie) => Promise<void> }).handleZwrotPlatnosci(e);

describe('Stripe: zwrot i spór do jednej płatności', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('zwrot całości + spór równocześnie: cofnięte 100, nie 200', async () => {
    const u = await prisma().user.create({ data: { email: `zw-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: new Prisma.Decimal(300) } });
    await prisma().walletTransaction.create({
      data: { userId: u.id, type: WalletTxType.TOPUP, amount: new Prisma.Decimal(100), balanceAfter: new Prisma.Decimal(300), paymentRef: 'pi_test_1', metadata: { wplata: { kwota: '100' } }, idempotencyKey: `topup-${u.id}` } as never,
    });
    const b = billing();
    await Promise.all([
      zwrot(b, { id: 'evt_r', type: 'charge.refunded', data: { object: { payment_intent: 'pi_test_1', amount_refunded: 10000 } } }).catch(() => undefined),
      zwrot(b, { id: 'evt_d', type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_test_1', amount: 10000 } } }).catch(() => undefined),
    ]);
    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.walletBalance.toFixed(2)).toBe('200.00');
  });
});

import { WalletTxType } from '@verris/database';
import { BillingService } from '../../src/billing/billing.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — zwrot i spór (chargeback) płatności za doładowanie, przez wejście webhooka Stripe
 * na prawdziwej bazie. Klient doładował 123 zł (100 K przy VAT 23%), część wydał.
 */

const pusty = new Proxy({}, { get: () => async () => undefined }) as never;
function serwis() {
  const p = prisma() as never;
  const stripe = { verifyWebhookSignature: () => undefined, parseEvent: (raw: Buffer) => JSON.parse(raw.toString('utf8')) };
  return new BillingService(
    p, new WalletLedgerService(p), stripe as never, new AuditService(p), { get: () => undefined } as never,
    pusty, pusty, { send: async () => undefined } as never, pusty, pusty, pusty,
  );
}

let n = 0;
async function klientPoDoladowaniu(saldo: number) {
  n += 1;
  const u = await prisma().user.create({ data: { email: `zwrot-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
  const pi = `pi_test_${n}_${Date.now()}`;
  await prisma().walletTransaction.create({
    data: {
      userId: u.id, type: WalletTxType.TOPUP, amount: 100, balanceAfter: 100, paymentProvider: 'STRIPE', paymentRef: pi,
      idempotencyKey: `stripe:checkout:cs_${pi}`, description: 'Doładowanie', metadata: { wplata: { kwota: '123.00', waluta: 'PLN' } },
    } as never,
  });
  const admin = await prisma().user.create({ data: { email: `admin-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
  return { u, pi, admin };
}
const zdarzenie = (id: string, type: string, object: Record<string, unknown>) =>
  Buffer.from(JSON.stringify({ id, type, data: { object } }));
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);

describe('X-04 zwroty i spory płatności za doładowanie', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('pełny zwrot w Stripe: 100 K cofnięte z portfela, admin dostaje powiadomienie', async () => {
    const { u, pi, admin } = await klientPoDoladowaniu(100);
    await serwis().handleStripeWebhook(zdarzenie('evt_r1', 'charge.refunded', { payment_intent: pi, amount_refunded: 12300 }), 'sig');
    expect(await saldo(u.id)).toBe(0);
    expect(await prisma().notification.count({ where: { userId: admin.id } })).toBe(1);
  });

  it('zwroty częściowe narastająco: 50%, potem całość — łącznie cofnięte dokładnie 100 K', async () => {
    const { u, pi } = await klientPoDoladowaniu(100);
    const s = serwis();
    await s.handleStripeWebhook(zdarzenie('evt_p1', 'charge.refunded', { payment_intent: pi, amount_refunded: 6150 }), 'sig');
    expect(await saldo(u.id)).toBe(50);
    await s.handleStripeWebhook(zdarzenie('evt_p2', 'charge.refunded', { payment_intent: pi, amount_refunded: 12300 }), 'sig');
    expect(await saldo(u.id)).toBe(0);
    // Ponowna dostawa tego samego zdarzenia nic nie zmienia.
    await s.handleStripeWebhook(zdarzenie('evt_p2', 'charge.refunded', { payment_intent: pi, amount_refunded: 12300 }), 'sig');
    expect(await saldo(u.id)).toBe(0);
  });

  it('chargeback po wydaniu środków: cofamy tyle, ile jest, portfel nie schodzi pod zero, brak zgłoszony', async () => {
    const { u, pi, admin } = await klientPoDoladowaniu(30);
    await serwis().handleStripeWebhook(zdarzenie('evt_d1', 'charge.dispute.created', { payment_intent: pi, amount: 12300, reason: 'fraudulent' }), 'sig');
    expect(await saldo(u.id)).toBe(0);
    const [p] = await prisma().notification.findMany({ where: { userId: admin.id } });
    expect(p.title).toContain('chargeback');
    expect(p.body).toContain('brakuje 70.00 K');
  });

  it('zwrot płatności, która nie była doładowaniem (np. karta za subskrypcję): portfel nietknięty', async () => {
    const { u } = await klientPoDoladowaniu(100);
    await serwis().handleStripeWebhook(zdarzenie('evt_x1', 'charge.refunded', { payment_intent: 'pi_obcy', amount_refunded: 4500 }), 'sig');
    expect(await saldo(u.id)).toBe(100);
  });
});

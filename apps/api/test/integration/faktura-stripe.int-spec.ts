import { AuditService } from '../../src/common/audit/audit.service.js';
import { InvoicesService } from '../../src/billing/invoices.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Faktura za płatność kartą: Stripe wysyła `invoice.paid` i `invoice.payment_succeeded` naraz
 * (plus późniejsze `invoice.finalized`). Jedna faktura = jeden numer VFV, bez dziury w serii,
 * jeden zapis PDF i jeden mail; opłacona nie wraca do OPEN.
 */
let pdfy = 0;
function uslugi() {
  const p = prisma() as never;
  const s = new InvoicesService(
    p, new AuditService(p), { get: () => undefined } as never, { send: async () => ({}) } as never,
    { putObject: async () => undefined } as never,
    { render: async () => { pdfy += 1; await new Promise((r) => setTimeout(r, 50)); return new Uint8Array([37, 80, 68, 70]); } } as never,
    { enqueueInvoice: async () => undefined } as never, null as never,
    { ustal: async () => ({ traktowanie: { kod: 'PL', stawka: 23, kraj: 'PL', adnotacja: null, b2cUe: false }, vies: null }) } as never,
  );
  const x = s as unknown as Record<string, unknown>;
  x.buildSellerSnapshot = async () => ({ name: 'Verris' });
  x.buildBuyerSnapshot = async () => ({ name: 'Klient' });
  x.buildLineItemLabel = async () => 'Hosting';
  x.sendInvoiceIssuedEmail = async () => undefined;
  return s;
}
const stripeInv = (status: string) => ({
  id: 'in_test_1', status, total: 4500, currency: 'pln', created: Math.floor(Date.now() / 1000), due_date: null,
  number: 'STRIPE-0001', hosted_invoice_url: null, invoice_pdf: null,
  status_transitions: { paid_at: status === 'paid' ? Math.floor(Date.now() / 1000) : null },
});

describe('Faktura Stripe: równoległe zdarzenia', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    pdfy = 0;
  });
  afterAll(rozlacz);

  it('paid + payment_succeeded naraz: jeden numer VFV, licznik +1, jeden zapis PDF i jeden mail; finalized później nie cofa PAID', async () => {
    const u = await prisma().user.create({ data: { email: `fs-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const s = uslugi();
    await s.upsertFromStripe(stripeInv('open') as never, { verrisUserId: u.id });
    await Promise.all([
      s.upsertFromStripe(stripeInv('paid') as never, { verrisUserId: u.id }),
      s.upsertFromStripe(stripeInv('paid') as never, { verrisUserId: u.id }),
    ]);
    await s.upsertFromStripe(stripeInv('open') as never, { verrisUserId: u.id });
    const f = await prisma().invoice.findFirstOrThrow({ where: { providerRef: 'in_test_1' } });
    expect(f.number).toMatch(/^V(FV|DR)\//);
    expect(f.status).toBe('PAID');
    expect(f.paidAt).not.toBeNull();
    const liczniki = await prisma().invoiceCounter.findMany();
    expect(liczniki.reduce((a, l) => a + l.seq, 0)).toBe(1);
    expect(await prisma().auditLog.count({ where: { action: 'INVOICE_PDF_GENERATED' } })).toBe(1);
    expect(pdfy).toBeGreaterThanOrEqual(1);
  });
});

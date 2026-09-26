import { Readable } from 'node:stream';
import { PDFDocument } from 'pdf-lib';
import { InvoicePdfService, nadrukDuplikatu } from './invoice-pdf.service.js';
import { InvoicesService } from './invoices.service.js';

/** M-07 — duplikat dokumentu: ta sama treść + nadruk na każdej stronie, audyt, tylko właściciel. */
async function oryginal(): Promise<Uint8Array> {
  return new InvoicePdfService({ get: () => undefined } as never).render({
    number: 'VDR/2026/09/0001',
    issuedAt: new Date('2026-09-01'),
    saleDate: new Date('2026-09-01'),
    dueAt: new Date('2026-09-08'),
    isPaid: true,
    paymentMethodLabel: 'Portfel Verris',
    currency: 'PLN',
    seller: { name: 'Verris', nip: '1', address: 'a', city: 'Łódź', postalCode: '90-001', country: 'PL', email: 'k@v.pl' },
    buyer: { name: 'Klient', email: 'x@y.pl' },
    lineItems: [{ name: 'Hosting', quantity: 1, unitNet: '10.00', vatRate: 23, totalNet: '10.00', totalVat: '2.30', totalGross: '12.30' }],
    totalNet: '10.00',
    totalVat: '2.30',
    totalGross: '12.30',
    vatRate: 23,
  });
}

describe('M-07 duplikat', () => {
  it('nadruk zachowuje liczbę stron i daje poprawny PDF', async () => {
    const o = await oryginal();
    const d = await nadrukDuplikatu(o, new Date('2026-09-23'));
    const [po, przed] = await Promise.all([PDFDocument.load(d), PDFDocument.load(o)]);
    expect(po.getPageCount()).toBe(przed.getPageCount());
    expect(d.byteLength).toBeGreaterThan(o.byteLength);
  });

  it('renderDuplicate czyta zapisany PDF właściciela, zapisuje audyt i nazwę -duplikat', async () => {
    const o = Buffer.from(await oryginal());
    const prisma = {
      invoice: {
        findFirst: vi.fn(async (a: { where: { userId: string } }) =>
          a.where.userId === 'u1' ? { storageKey: 'k', number: 'VDR/2026/09/0001', hostedUrl: null } : null,
        ),
      },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const storage = { getObjectStream: vi.fn(async () => Readable.from([o.subarray(0, 100), o.subarray(100)])) };
    const s = new InvoicesService(prisma as never, audit as never, {} as never, {} as never, storage as never, {} as never, {} as never, {} as never, {} as never);
    const { pdf, filename } = await s.renderDuplicate('u1', 'i1');
    expect(filename).toBe('VDR-2026-09-0001-duplikat.pdf');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_DUPLICATE_ISSUED' }));
    await expect(s.renderDuplicate('u2', 'i1')).rejects.toThrow('Faktura nie znaleziona');
  });
});

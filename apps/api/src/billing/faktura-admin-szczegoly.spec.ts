import { Prisma } from '@verris/database';
import { InvoicesService } from './invoices.service.js';

/**
 * 12.10 (test KSeF na prod): admin → Faktury → Koryguj pokazywał pustą tabelę pozycji i puste dane
 * nabywcy, a „Wystaw korektę” był nieaktywny — szczegóły faktury dla admina nie zwracały
 * `lineItems` ani `buyerSnapshot`, z których formularz korekty buduje wiersze.
 */
describe('InvoicesService.getForAdmin — treść dla formularza korekty', () => {
  it('zwraca pozycje, dane nabywcy oraz netto i VAT', async () => {
    const pozycje = [{ name: 'Test integracji KSeF', quantity: 1, unitNet: '1.00', vatRate: 23, totalNet: '1.00', totalVat: '0.23', totalGross: '1.23' }];
    const nabywca = { name: 'Dominik Kowalski', email: 'k@x.pl' };
    const prisma = {
      invoice: {
        findFirst: async () => null,
        findUnique: async () => ({
          id: 'f1', number: 'VFV/2026/10/0001', status: 'PAID', amount: new Prisma.Decimal('1.23'),
          netAmount: new Prisma.Decimal('1.00'), vatAmount: new Prisma.Decimal('0.23'), currency: 'PLN',
          hostedUrl: null, pdfUrl: null, storageKey: 'k', provider: 'MANUAL', providerRef: 'r', subscriptionId: null,
          issuedAt: new Date(), dueAt: null, paidAt: new Date(), createdAt: new Date(), rodzajPrawny: 'FAKTURA_VAT',
          externalInvoiceNumber: null, externalInvoiceAt: null, ksefNumber: null, ksefStatus: 'ACCEPTED', ksefError: null,
          ksefSubmittedAt: null, ksefAcceptedAt: null, ksefTerminDo: null, kind: 'STANDARD',
          lineItems: pozycje, buyerSnapshot: nabywca, userId: 'u1',
          user: { email: 'k@x.pl', firstName: 'Dominik', lastName: 'Kowalski', companyName: null },
          subscription: null, corrected: null, walletEntries: [],
        }),
      },
    };
    const svc = new InvoicesService(prisma as never, {} as never, { get: () => undefined } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const d = await svc.getForAdmin('f1');
    expect(d.lineItems).toEqual(pozycje);
    expect(d.buyerSnapshot).toEqual(nabywca);
    expect([d.netAmount, d.vatAmount]).toEqual(['1.00', '0.23']);
    expect(d.stanPoKorektach).toBeNull();
  });

  // Przegląd 13.10: K1 zdjęła pozycję A, a formularz K2 startował od faktury pierwotnej (A=100, B=100). Admin
  // zmieniał B na 20 i widział zwrot −80, a API liczyło od stanu po K1: +20 i po cichu przywracało A.
  it('faktura z korektami: stan po ostatniej korekcie (od niego API liczy kolejną)', async () => {
    const D = (v: string) => new Prisma.Decimal(v);
    const pierwotna = {
      id: 'f1', number: 'VFV/2026/10/0002', status: 'PAID', amount: D('200.00'), netAmount: D('162.60'), vatAmount: D('37.40'),
      currency: 'PLN', hostedUrl: null, pdfUrl: null, storageKey: 'k', provider: 'MANUAL', providerRef: 'r', subscriptionId: null,
      issuedAt: new Date(), dueAt: null, paidAt: new Date(), createdAt: new Date(), rodzajPrawny: 'FAKTURA_VAT',
      externalInvoiceNumber: null, externalInvoiceAt: null, ksefNumber: null, ksefStatus: 'ACCEPTED', ksefError: null,
      ksefSubmittedAt: null, ksefAcceptedAt: null, ksefTerminDo: null, kind: 'STANDARD',
      lineItems: [{ name: 'A', totalGross: '100.00' }, { name: 'B', totalGross: '100.00' }], buyerSnapshot: { name: 'Stary' }, userId: 'u1',
      user: { email: 'k@x.pl', firstName: null, lastName: null, companyName: null }, subscription: null, corrected: null, walletEntries: [],
    };
    const k1 = {
      kind: 'KOREKTA', amount: D('-100.00'), netAmount: D('-81.30'), vatAmount: D('-18.70'),
      correctedAmount: D('200.00'), correctedNet: D('162.60'), correctedVat: D('37.40'),
      lineItems: [{ name: 'B', totalGross: '100.00' }], buyerSnapshot: { name: 'Nowy' },
    };
    const prisma = { invoice: { findUnique: async () => pierwotna, findFirst: async () => k1 } };
    const svc = new InvoicesService(prisma as never, {} as never, { get: () => undefined } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const d = await svc.getForAdmin('f1');
    expect(d.lineItems).toEqual(pierwotna.lineItems);
    expect(d.stanPoKorektach).toEqual({
      amount: '100.00', netAmount: '81.30', vatAmount: '18.70', lineItems: [{ name: 'B', totalGross: '100.00' }], buyerSnapshot: { name: 'Nowy' },
    });
  });
});

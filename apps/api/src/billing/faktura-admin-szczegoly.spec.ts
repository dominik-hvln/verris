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
  });
});

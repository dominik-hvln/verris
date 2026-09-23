import { InvoicePdfService } from '../../billing/invoice-pdf.service';
import { DpaPdfService } from '../../compliance/dpa-pdf.service';

/**
 * Dokumenty PDF z polskimi znakami renderują się bez wyjątku.
 *
 * Do 2026-09-23 oba renderery używały StandardFonts (WinAnsi) i padały na „ż”
 * w stałym nagłówku „Data sprzedaży” — żadna faktura ani DPA nie powstawała,
 * a nic tego nie sprawdzało, bo nikt nie renderował PDF-a w teście.
 */
const PL = 'Zażółć gęślą jaźń — ŁÓDŹ, ul. Źródlana 5, „cudzysłów”, € 1 000,00 • ✓';

describe('PDF z polskimi znakami', () => {
  it('faktura', async () => {
    const pdf = await new InvoicePdfService({ get: () => undefined } as never).render({
      number: 'VFV/2026/09/0001',
      issuedAt: new Date('2026-09-23'),
      saleDate: new Date('2026-09-23'),
      dueAt: new Date('2026-09-30'),
      isPaid: false,
      paymentMethodLabel: 'Przelew',
      currency: 'PLN',
      seller: { name: 'Verris Sp. z o.o.', nip: '1234567890', address: PL, city: 'Łódź', postalCode: '90-001', country: 'PL', email: 'k@v.pl', bankAccount: '12 3456' },
      buyer: { name: PL, nip: '9876543210', address: PL, city: 'Gdańsk', postalCode: '80-001', country: 'PL', email: 'x@y.pl' },
      lineItems: [{ name: PL, quantity: 1, unitNet: '100.00', vatRate: 23, totalNet: '100.00', totalVat: '23.00', totalGross: '123.00' }],
      totalNet: '100.00',
      totalVat: '23.00',
      totalGross: '123.00',
      vatRate: 23,
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('DPA', async () => {
    const svc = new DpaPdfService(null as never, null as never, null as never, null as never);
    const pdf: Uint8Array = await (svc as unknown as { renderPdf: (i: unknown) => Promise<Uint8Array> }).renderPdf({
      company: { companyName: PL, nip: '1', address: PL, city: 'Łódź', postalCode: '90-001', country: 'PL', email: 'a@b.pl', firstName: 'Józef', lastName: 'Żółkiewski' },
      dpaVersion: '1.0',
      dpaTitle: 'Umowa powierzenia przetwarzania danych osobowych',
      dpaContent: `# Umowa\n\n${PL}\n\n- punkt ${PL}\n\n\`kod ąę\``,
      acceptedAt: new Date('2026-09-23'),
      acceptanceId: 'abc',
    });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

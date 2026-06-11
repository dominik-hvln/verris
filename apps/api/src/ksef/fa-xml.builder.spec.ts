import { Prisma } from '@verris/database';
import { buildFaXml, FaXmlValidationError, normalizeNip } from './fa-xml.builder';

function invoice(over: Record<string, unknown> = {}) {
  return {
    number: 'VFV/2026/06/0001',
    amount: new Prisma.Decimal('123.00'),
    netAmount: new Prisma.Decimal('100.00'),
    vatAmount: new Prisma.Decimal('23.00'),
    vatRate: new Prisma.Decimal('23'),
    currency: 'PLN',
    issuedAt: new Date('2026-06-01T10:00:00Z'),
    paidAt: new Date('2026-06-01T10:00:00Z'),
    sellerSnapshot: {
      name: 'Verris Sp. z o.o.',
      nip: '526-10-40-828',
      address: 'ul. Przykładowa 1',
      city: 'Warszawa',
      postalCode: '00-001',
      country: 'PL',
    },
    buyerSnapshot: {
      companyName: 'Klient Testowy Sp. z o.o.',
      nip: '7010001454',
      address: 'ul. Nabywców 2',
      city: 'Kraków',
      postalCode: '30-001',
      country: 'PL',
    },
    lineItems: [
      {
        name: 'Hosting Pro — 2026-06',
        quantity: 1,
        unitNet: '100.00',
        vatRate: 23,
        totalNet: '100.00',
        totalVat: '23.00',
        totalGross: '123.00',
      },
    ],
    ...over,
  } as never;
}

describe('buildFaXml (B-1 KSeF)', () => {
  it('builds a valid FA(2) document from real invoice data', () => {
    const { xml, summary } = buildFaXml({ invoice: invoice() });
    expect(xml).toContain('<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">');
    expect(xml).toContain('<WariantFormularza>2</WariantFormularza>');
    expect(xml).toContain('<NIP>5261040828</NIP>'); // seller, znormalizowany
    expect(xml).toContain('<NIP>7010001454</NIP>'); // buyer
    expect(xml).toContain('<P_2>VFV/2026/06/0001</P_2>');
    expect(xml).toContain('<P_13_1>100.00</P_13_1>');
    expect(xml).toContain('<P_14_1>23.00</P_14_1>');
    expect(xml).toContain('<P_15>123.00</P_15>');
    expect(xml).toContain('<RodzajFaktury>VAT</RodzajFaktury>');
    expect(xml).toContain('<P_7>Hosting Pro — 2026-06</P_7>');
    expect(summary.sellerNip).toBe('5261040828');
  });

  it('uses BrakID for a consumer without NIP', () => {
    const { xml } = buildFaXml({
      invoice: invoice({
        buyerSnapshot: { firstName: 'Jan', lastName: 'Kowalski', city: 'Łódź', country: 'PL' },
      }),
    });
    expect(xml).toContain('<BrakID>1</BrakID>');
    expect(xml).toContain('<Nazwa>Jan Kowalski</Nazwa>');
  });

  it('escapes XML-unsafe characters in names', () => {
    const { xml } = buildFaXml({
      invoice: invoice({
        buyerSnapshot: { companyName: 'A&B "Co" <script>', nip: '7010001454', country: 'PL' },
      }),
    });
    expect(xml).toContain('A&amp;B &quot;Co&quot; &lt;script&gt;');
    expect(xml).not.toContain('<script>');
  });

  it('rejects an invoice without a seller NIP', () => {
    expect(() =>
      buildFaXml({ invoice: invoice({ sellerSnapshot: { name: 'X', country: 'PL' } }) }),
    ).toThrow(FaXmlValidationError);
  });

  it('rejects inconsistent amounts (net + vat != gross)', () => {
    expect(() =>
      buildFaXml({ invoice: invoice({ vatAmount: new Prisma.Decimal('5.00') }) }),
    ).toThrow(FaXmlValidationError);
  });

  it('rejects a missing VAT breakdown', () => {
    expect(() => buildFaXml({ invoice: invoice({ netAmount: null }) })).toThrow(
      FaXmlValidationError,
    );
  });

  it('normalizeNip strips separators and validates length', () => {
    expect(normalizeNip('526-10-40-828')).toBe('5261040828');
    expect(normalizeNip('PL 5261040828')).toBe('5261040828');
    expect(normalizeNip('123')).toBeNull();
    expect(normalizeNip(null)).toBeNull();
  });
});

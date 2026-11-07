import { renderToStaticMarkup } from 'react-dom/server';
import type { InvoiceDto } from '@verris/contracts/klient';
import { InvoiceList } from './invoice-list';

/**
 * M-14 (KSeF 07.11) — klient widzi przy fakturze numer KSeF, datę przyjęcia, link weryfikacji (KOD I)
 * i może pobrać UPO. Do dziś był tylko numer KSeF, a UPO pobierał wyłącznie admin.
 */
const baza: InvoiceDto = {
  id: '11111111-1111-1111-1111-111111111111',
  number: 'VFV/2026/11/0001',
  status: 'PAID',
  amount: '123.00',
  currency: 'PLN',
  hostedUrl: null,
  pdfUrl: null,
  hasPdf: true,
  provider: 'WALLET',
  providerRef: null,
  subscriptionId: null,
  issuedAt: '2026-11-07T09:00:00.000Z',
  dueAt: null,
  paidAt: null,
  createdAt: '2026-11-07T09:00:00.000Z',
  rodzajPrawny: 'FAKTURA_VAT',
  externalInvoiceNumber: null,
  externalInvoiceAt: null,
  ksefNumber: '9292069367-20261107-0100001AF629-AF',
  ksefXml: true,
  ksefPrzyjeto: '2026-11-07T09:05:00.000Z',
  ksefWeryfikacja: 'https://qr-test.ksef.mf.gov.pl/invoice/9292069367/07-11-2026/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE',
  ksefUpo: true,
} as InvoiceDto;

describe('Lista faktur – KSeF (M-14)', () => {
  it('przyjęta: numer KSeF, data przyjęcia, link weryfikacji i przycisk UPO', () => {
    const html = renderToStaticMarkup(<InvoiceList rows={[baza]} />);
    expect(html).toContain('9292069367-20261107-0100001AF629-AF');
    expect(html).toContain('przyjęta 07.11.2026');
    expect(html).toContain(`href="${baza.ksefWeryfikacja}"`);
    expect(html).toContain('sprawdź w KSeF');
    expect(html).toContain(`href="/api/billing/invoices/${baza.id}/upo"`);
  });

  it('bez numeru i bez UPO: „numer w trakcie nadawania”, link weryfikacji jest, przycisku UPO nie ma', () => {
    const html = renderToStaticMarkup(<InvoiceList rows={[{ ...baza, ksefNumber: null, ksefPrzyjeto: null, ksefUpo: false }]} />);
    expect(html).toContain('numer w trakcie nadawania');
    expect(html).toContain('sprawdź w KSeF');
    expect(html).not.toContain('/upo"');
  });
});

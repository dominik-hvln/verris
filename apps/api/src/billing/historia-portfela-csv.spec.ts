import { Prisma } from '@verris/database';
import { BillingService } from './billing.service.js';
import { historiaPortfelaCsv, nazwaPlikuHistorii } from './historia-portfela-csv.js';

const D = (v: string) => new Prisma.Decimal(v);

/**
 * P2-10 (beta 3.11): „Pobierz całą historię (CSV)” dawał klientowi zrzut techniczny (userId, idempotencyKey,
 * PROMO_CREDIT, czas UTC, bez numeru dokumentu i VAT). Księgowa ma dostać polskie kolumny i dokument za wpłatę.
 */
describe('P2-10 — historia portfela dla klienta', () => {
  const wiersze = [
    {
      createdAt: new Date('2026-11-02T23:08:12Z'),
      type: 'PROMO_CREDIT',
      status: 'COMPLETED',
      amount: D('150.00'),
      balanceAfter: D('150.00'),
      currency: 'PLN',
      description: 'Testy przed startem (beta)',
      invoice: null,
    },
    {
      createdAt: new Date('2026-11-03T09:30:00Z'),
      type: 'TOPUP',
      status: 'COMPLETED',
      amount: D('123.00'),
      balanceAfter: D('273.00'),
      currency: 'PLN',
      description: 'Doładowanie Stripe',
      invoice: { number: 'VDR/2026/11/0001', externalInvoiceNumber: 'FV 12/11/2026', netAmount: D('100.00'), vatAmount: D('23.00') },
    },
    {
      createdAt: new Date('2026-11-03T10:00:00Z'),
      type: 'CHARGE_SUBSCRIPTION',
      status: 'COMPLETED',
      amount: D('-45.00'),
      balanceAfter: D('228.00'),
      currency: 'PLN',
      description: 'Subscription 6649b93b-1234-4abc-8def-1234567890ab (initial payment)',
      invoice: null,
    },
  ];

  it('polskie nagłówki, czas polski, kwoty z przecinkiem, bez identyfikatorów technicznych', () => {
    const csv = historiaPortfelaCsv(wiersze);
    const [naglowek, kod, wplata, zakup] = csv.replace('﻿', '').trim().split('\r\n');
    expect(naglowek).toBe('Data;Operacja;Opis;Kwota (zł = K);Saldo po (K);Stan;Numer dokumentu;Netto dokumentu (zł);VAT dokumentu (zł)');
    expect(kod).toMatch(/^2026-11-03 00:08;/);
    expect(kod).not.toContain('PROMO_CREDIT');
    expect(wplata).toContain('123,00;273,00;zaksięgowana;FV 12/11/2026;100,00;23,00');
    expect(wplata).toContain('Doładowanie kartą');
    expect(zakup).toContain('Pierwsza opłata za usługę;-45,00;228,00');
    expect(csv).not.toMatch(/userId|idempotencyKey|COMPLETED|Stripe|6649b93b/);
  });

  it('formuły arkusza w opisie są zneutralizowane', () => {
    const csv = historiaPortfelaCsv([{ ...wiersze[0]!, description: '=HYPERLINK("x")' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('nazwa pliku po polsku, bez identyfikatora klienta', () => {
    expect(nazwaPlikuHistorii(new Date('2026-11-02T23:30:00Z'))).toBe('historia-portfela-2026-11-03.csv');
  });

  it('serwis bierze tylko wpisy klienta i dokument za wpłatę', async () => {
    const findMany = vi.fn(async () => wiersze);
    const n = {} as never;
    const svc = new BillingService({ walletTransaction: { findMany } } as never, n, n, n, n, n, n, n, n, n, n);
    const { csv, filename } = await svc.eksportHistoriiPortfelaKlienta('u1', {});
    expect(filename).toMatch(/^historia-portfela-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv).toContain('FV 12/11/2026');
    const arg = (findMany.mock.calls[0] as unknown as [{ where: { userId: string }; select: Record<string, unknown> }])[0];
    expect(arg.where.userId).toBe('u1');
    expect(arg.select).not.toHaveProperty('idempotencyKey');
  });
});

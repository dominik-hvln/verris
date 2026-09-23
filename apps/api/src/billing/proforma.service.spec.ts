import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { ProformaService, koniecOkresu } from './proforma.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { RODZAJ_PROFORMA } from './tryb-fakturowania';

/** M-24 — proforma na odnowienie: ta sama kwota co obciążenie, bez serii VAT, tylko właściciel. */
function zbuduj(nadpisz: Record<string, unknown> = {}) {
  const sub = {
    id: 'abcdef12-0000-0000-0000-000000000000',
    userId: 'u1',
    status: 'ACTIVE',
    cancelAt: null,
    currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
    interval: 'MONTH',
    currency: 'PLN',
    paymentSource: 'WALLET',
    priceAmount: new Prisma.Decimal('19.99'),
    listPriceAmount: new Prisma.Decimal('29.99'),
    appliedPromoCodeId: null,
    introDiscountPct: 0,
    introDiscountPeriodsLeft: 0,
    plan: { name: 'Pro' },
    account: { domain: 'klient.pl' },
    ...nadpisz,
  };
  const prisma = {
    subscription: {
      findFirst: jest.fn(async (a: { where: { id: string; userId: string } }) =>
        a.where.userId === sub.userId && a.where.id === sub.id ? sub : null,
      ),
    },
  };
  const promo = { resolveNextRenewalAmount: jest.fn(async () => new Prisma.Decimal('36.90')) };
  const pdf = new InvoicePdfService({ get: () => undefined } as never);
  const render = jest.spyOn(pdf, 'render');
  const invoices = {
    buildSellerSnapshot: jest.fn(async () => ({
      name: 'Verris', nip: '1234567890', address: 'ul. A 1', city: 'Łódź', postalCode: '90-001', country: 'PL', email: 'k@v.pl',
    })),
    buildBuyerSnapshot: jest.fn(async () => ({ name: 'Klient', email: 'u1@x.pl' })),
  };
  const s = new ProformaService(prisma as never, promo as never, pdf, invoices as never);
  return { s, sub, promo, render };
}

describe('ProformaService', () => {
  it('kwota z resolveNextRenewalAmount, rodzaj PROFORMA, numer spoza serii VAT', async () => {
    const { s, sub, render } = zbuduj();
    const { pdf, filename } = await s.render('u1', sub.id);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    const ctx = render.mock.calls[0][0];
    expect(ctx.rodzajPrawny).toBe(RODZAJ_PROFORMA);
    expect(ctx.totalGross).toBe('36.90');
    expect(ctx.totalNet).toBe('30.00');
    expect(ctx.totalVat).toBe('6.90');
    expect(ctx.number).toBe('PRO/20261001/ABCDEF12');
    expect(ctx.number).not.toMatch(/^V/);
    expect(ctx.lineItems[0].name).toContain('klient.pl');
    expect(filename).toBe('proforma-PRO-20261001-ABCDEF12.pdf');
  });

  it('cudza usługa → 404', async () => {
    const { s, sub } = zbuduj();
    await expect(s.render('u2', sub.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usługa z zaplanowaną rezygnacją → 409', async () => {
    const { s, sub } = zbuduj({ cancelAt: new Date() });
    await expect(s.render('u1', sub.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('koniec okresu: miesiąc i rok', () => {
    expect(koniecOkresu(new Date('2026-01-31T00:00:00Z'), 'YEAR').toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(koniecOkresu(new Date('2026-10-01T00:00:00Z'), 'MONTH').toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

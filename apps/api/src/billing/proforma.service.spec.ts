import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { ProformaService, koniecOkresu, kwotaPozycji, policzProforme } from './proforma.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { RODZAJ_PROFORMA } from './tryb-fakturowania.js';

/** M-24 — proforma na odnowienie: ta sama kwota co obciążenie, bez serii VAT, tylko właściciel. */
function zbuduj(nadpisz: Record<string, unknown> = {}, traktowanie: Record<string, unknown> = { kod: 'PL', stawka: 23, cenaNetto: false, adnotacja: null }) {
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
      findFirst: vi.fn(async (a: { where: { id: string; userId: string } }) =>
        a.where.userId === sub.userId && a.where.id === sub.id ? sub : null,
      ),
    },
  };
  const promo = { resolveNextRenewalAmount: vi.fn(async () => new Prisma.Decimal('36.90')) };
  const pdf = new InvoicePdfService({ get: () => undefined } as never);
  const render = vi.spyOn(pdf, 'render');
  const invoices = {
    buildSellerSnapshot: vi.fn(async () => ({
      name: 'Verris', nip: '1234567890', address: 'ul. A 1', city: 'Łódź', postalCode: '90-001', country: 'PL', email: 'k@v.pl',
    })),
    buildBuyerSnapshot: vi.fn(async () => ({ name: 'Klient', email: 'u1@x.pl' })),
  };
  const vat = { ustal: vi.fn(async () => ({ traktowanie, vies: null })) };
  const s = new ProformaService(prisma as never, promo as never, pdf, invoices as never, vat as never);
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

  it('klient rozliczany netto (odwrotne obciążenie): kwota K/1,23, „np”, adnotacja', async () => {
    const { s, sub, render } = zbuduj({}, { kod: 'OO', stawka: null, cenaNetto: true, adnotacja: 'odwrotne obciążenie' });
    await s.render('u1', sub.id);
    const ctx = render.mock.calls[0][0];
    expect(ctx.totalGross).toBe('30.00');
    expect(ctx.totalVat).toBe('0.00');
    expect(ctx.lineItems[0].vatLabel).toBe('np');
    expect(ctx.vat?.adnotacja).toBe('odwrotne obciążenie');
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

const D = (v: string) => new Prisma.Decimal(v);

describe('K4 — policzProforme (kwoty jak w dokumencie za wpłatę)', () => {
  it('23%: rozbicie per pozycja tą samą funkcją co dokument, suma = suma pozycji', () => {
    const r = policzProforme([{ nazwa: 'A', brutto: D('12.30') }, { nazwa: 'B', brutto: D('0.99') }], { stawka: 23 });
    expect(r.lineItems.map((l) => [l.totalNet, l.totalVat, l.totalGross])).toEqual([['10.00', '2.30', '12.30'], ['0.80', '0.19', '0.99']]);
    expect([r.netto.toFixed(2), r.vat.toFixed(2), r.brutto.toFixed(2)]).toEqual(['10.80', '2.49', '13.29']);
    expect(r.netto.plus(r.vat).eq(r.brutto)).toBe(true);
    expect(r.lineItems[0].vatLabel).toBeUndefined();
  });

  it('„np” (odwrotne obciążenie): brutto = netto, VAT 0, etykieta np', () => {
    const r = policzProforme([{ nazwa: 'A', brutto: D('30.00') }], { stawka: null });
    expect([r.netto.toFixed(2), r.vat.toFixed(2), r.brutto.toFixed(2)]).toEqual(['30.00', '0.00', '30.00']);
    expect(r.lineItems[0].vatLabel).toBe('np');
  });

  it('kwota pozycji: dodatnia, najwyżej 2 miejsca po przecinku', () => {
    expect(kwotaPozycji('9.99').toFixed(2)).toBe('9.99');
    expect(() => kwotaPozycji(0)).toThrow(BadRequestException);
    expect(() => kwotaPozycji('1.001')).toThrow(BadRequestException);
    expect(() => kwotaPozycji('abc')).toThrow(BadRequestException);
  });
});

describe('K4 — wystawienie i anulowanie proformy', () => {
  function zbudujK4(o: { user?: Record<string, unknown>; sub?: Record<string, unknown>; count?: number } = {}) {
    const user = { id: 'u1', role: 'USER', email: 'k@x.pl', firstName: 'Ala', anonymizedAt: null, customerOwnerId: null, ...o.user };
    const sub = {
      id: 'abcdef12-0000-0000-0000-000000000000', userId: 'u1', status: 'ACTIVE', cancelAt: null,
      currentPeriodEnd: new Date('2026-11-01T00:00:00Z'), interval: 'MONTH', currency: 'PLN', paymentSource: 'WALLET',
      priceAmount: D('36.90'), listPriceAmount: D('36.90'), appliedPromoCodeId: null, introDiscountPct: 0,
      introDiscountPeriodsLeft: 0, individualPrice: null, plan: { name: 'Pro' }, account: { domain: 'klient.pl' }, ...o.sub,
    };
    const utworzone: Array<Record<string, unknown>> = [];
    const tx = {
      $queryRaw: vi.fn(async () => [{ seq: 7 }]),
      proforma: { create: vi.fn(async (a: { data: Record<string, unknown> }) => { utworzone.push(a.data); return { id: 'pf-1', ...a.data }; }) },
    };
    const prisma = {
      user: { findUnique: vi.fn(async () => user) },
      subscription: { findFirst: vi.fn(async () => sub) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      proforma: {
        findUnique: vi.fn(async () => ({ id: 'pf-1', userId: 'u1', number: 'PRO/2026/10/0007', amount: D('10'), user: { email: 'k@x.pl', firstName: null, role: 'USER' } })),
        updateMany: vi.fn(async () => ({ count: o.count ?? 1 })),
      },
    };
    const promo = { resolveNextRenewalAmount: vi.fn(async () => D('36.90')) };
    const invoices = { buildSellerSnapshot: vi.fn(async () => ({ name: 'V' })), buildBuyerSnapshot: vi.fn(async () => ({ name: 'K', email: 'k@x.pl' })) };
    const vat = { ustal: vi.fn(async () => ({ traktowanie: { kod: 'PL', stawka: 23, kraj: 'PL', cenaNetto: false, adnotacja: null }, vies: null })) };
    const audit = { record: vi.fn(async () => undefined) };
    const mailer = { send: vi.fn(async () => undefined) };
    const cfg = { get: () => 'https://panel.test' };
    const s = new ProformaService(prisma as never, promo as never, {} as never, invoices as never, vat as never, audit as never, mailer as never, cfg as never);
    return { s, prisma, utworzone, audit, mailer, tx };
  }
  const OP = { userId: 'op1', role: 'STAFF' };
  const TERAZ = new Date('2026-10-12T10:00:00Z');

  it('odnowienie + pozycja dowolna: seria PRO (nie VAT), kwoty, stawka zapisana, termin, mail z linkiem do panelu', async () => {
    const { s, utworzone, tx, mailer, audit } = zbudujK4();
    const w = await s.wystaw({ userId: 'u1', operator: OP, odnowienieSubscriptionId: 'abcdef12-0000-0000-0000-000000000000', pozycje: [{ nazwa: 'Migracja strony', kwotaBrutto: 12.3 }], terminDni: 3, teraz: TERAZ });
    expect(w.numer).toBe('PRO/2026/10/0007');
    // Licznik serii PRO — nie VFV/VDR.
    expect((tx.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toContain('PRO');
    const d = utworzone[0];
    expect((d.amount as Prisma.Decimal).toFixed(2)).toBe('49.20');
    expect((d.netAmount as Prisma.Decimal).toFixed(2)).toBe('40.00');
    expect((d.vatAmount as Prisma.Decimal).toFixed(2)).toBe('9.20');
    expect(d.subscriptionId).toBe('abcdef12-0000-0000-0000-000000000000');
    expect(d.vatMeta).toMatchObject({ vatKod: 'PL', vatStawka: '23', vatKraj: 'PL' });
    expect((d.dueAt as Date).toISOString()).toBe('2026-10-15T10:00:00.000Z');
    expect(String((d.lineItems as Array<{ name: string }>)[0].name)).toContain('klient.pl');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mailer.send.mock.calls[0])).toContain('https://panel.test/dashboard/billing?proforma=pf-1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROFORMA_WYSTAWIONA', userId: 'u1', actorUserId: 'op1' }));
  });

  it('odnowienie usługi z karty → 409 (drugie obciążenie za ten sam okres)', async () => {
    const { s } = zbudujK4({ sub: { paymentSource: 'STRIPE_CARD' } });
    await expect(s.wystaw({ userId: 'u1', operator: OP, odnowienieSubscriptionId: 'abcdef12-0000-0000-0000-000000000000' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('bez pozycji, poniżej 1 zł, subkonto, konto zespołu przez STAFF → odmowa, nic nie zapisane', async () => {
    for (const [o, z] of [
      [{}, {}],
      [{}, { pozycje: [{ nazwa: 'Drobna', kwotaBrutto: 0.99 }] }],
      [{ user: { customerOwnerId: 'w1' } }, { pozycje: [{ nazwa: 'Usługa', kwotaBrutto: 10 }] }],
      [{ user: { role: 'STAFF' } }, { pozycje: [{ nazwa: 'Usługa', kwotaBrutto: 10 }] }],
    ] as const) {
      const { s, utworzone } = zbudujK4(o as never);
      await expect(s.wystaw({ userId: 'u1', operator: OP, ...(z as object) })).rejects.toThrow();
      expect(utworzone).toHaveLength(0);
    }
  });

  it('anulowanie: powód obowiązkowy; już opłacona/anulowana → 409; udane → wpis w dzienniku i mail', async () => {
    const a = zbudujK4();
    await expect(a.s.anuluj({ id: 'pf-1', operator: OP, powod: 'krótko' })).rejects.toBeInstanceOf(BadRequestException);
    await a.s.anuluj({ id: 'pf-1', operator: OP, powod: 'klient zrezygnował z usługi' });
    expect(a.prisma.proforma.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pf-1', status: 'WYSTAWIONA' } }));
    expect(a.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROFORMA_ANULOWANA' }));
    expect(a.mailer.send).toHaveBeenCalledTimes(1);
    const b = zbudujK4({ count: 0 });
    await expect(b.s.anuluj({ id: 'pf-1', operator: OP, powod: 'klient zrezygnował z usługi' })).rejects.toBeInstanceOf(ConflictException);
    expect(b.audit.record).not.toHaveBeenCalled();
  });
});

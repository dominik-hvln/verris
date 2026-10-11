import { Prisma } from '@verris/database';
import { InvoicesService } from '../../src/billing/invoices.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Plan E, patch 10 — strona faktury w panelu admina. Ponowienie KSeF było tylko w „Danych firmy”, a do
 * wpłaty pokrytej fakturą nie prowadziło nic. Odczyt na prawdziwej bazie: relacje walletEntries i
 * corrected (Restrict/SetNull) oraz pola KSeF.
 */
function serwis(): InvoicesService {
  const nic = {} as never;
  return new InvoicesService(prisma() as never, nic, nic, nic, nic, nic, nic, nic, nic);
}

describe('Strona faktury (admin) — getForAdmin', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('stan KSeF, wpłaty z portfela pokryte fakturą i faktura korygowana', async () => {
    const u = await prisma().user.create({ data: { email: `p10-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const f = await prisma().invoice.create({
      data: {
        userId: u.id,
        number: 'VFV/2026/10/0001',
        status: 'PAID',
        amount: new Prisma.Decimal('55.35'),
        currency: 'PLN',
        ksefStatus: 'REJECTED',
        ksefError: 'Niepoprawny NIP nabywcy',
        ksefSubmittedAt: new Date('2026-10-01T10:00:00Z'),
      },
    });
    await prisma().walletTransaction.create({
      data: { userId: u.id, type: 'CHARGE_SUBSCRIPTION', amount: new Prisma.Decimal('-55.35'), balanceAfter: new Prisma.Decimal('0'), invoiceId: f.id, description: 'Abonament' },
    });
    const k = await prisma().invoice.create({
      data: {
        userId: u.id,
        number: 'VFK/2026/10/0001',
        status: 'PAID',
        amount: new Prisma.Decimal('-10.00'),
        currency: 'PLN',
        kind: 'KOREKTA',
        correctedId: f.id,
        correctionKind: 'WARTOSCIOWA',
        correctionReason: 'Rabat',
      },
    });

    const r = await serwis().getForAdmin(f.id);
    expect(r).toMatchObject({
      id: f.id,
      user: { id: u.id },
      kind: 'VAT',
      korygowana: null,
      ksef: { status: 'REJECTED', blad: 'Niepoprawny NIP nabywcy', wyslano: '2026-10-01T10:00:00.000Z', numer: null, przyjeto: null },
    });
    expect(r.platnosci).toEqual([expect.objectContaining({ type: 'CHARGE_SUBSCRIPTION', amount: '-55.35', description: 'Abonament' })]);

    const rk = await serwis().getForAdmin(k.id);
    expect(rk).toMatchObject({ kind: 'KOREKTA', korygowana: { id: f.id, number: 'VFV/2026/10/0001' }, platnosci: [] });
  });

  it('F3.6 — lista faktur: kolumna KSeF (stan i numer) i filtr po stanie KSeF', async () => {
    const u = await prisma().user.create({ data: { email: `f36-ksef-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const baza = { userId: u.id, status: 'PAID' as const, amount: new Prisma.Decimal('10.00'), currency: 'PLN' };
    await prisma().invoice.create({ data: { ...baza, number: 'VFV/2026/10/0101', ksefStatus: 'ACCEPTED', ksefNumber: '1234567890-20261011-ABCDEF-01' } });
    await prisma().invoice.create({ data: { ...baza, number: 'VFV/2026/10/0102', ksefStatus: 'REJECTED' } });
    await prisma().invoice.create({ data: { ...baza, number: 'VFV/2026/10/0103' } });

    const wszystkie = await serwis().listForAdmin({ userId: u.id });
    expect(Object.fromEntries(wszystkie.rows.map((r) => [r.number, [r.ksefStatus, r.ksefNumber]]))).toEqual({
      'VFV/2026/10/0101': ['ACCEPTED', '1234567890-20261011-ABCDEF-01'],
      'VFV/2026/10/0102': ['REJECTED', null],
      'VFV/2026/10/0103': ['NOT_APPLICABLE', null],
    });
    const odrzucone = await serwis().listForAdmin({ userId: u.id, ksefStatuses: ['REJECTED', 'OFFLINE'] });
    expect(odrzucone.rows.map((r) => r.number)).toEqual(['VFV/2026/10/0102']);
  });
});

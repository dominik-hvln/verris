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
});

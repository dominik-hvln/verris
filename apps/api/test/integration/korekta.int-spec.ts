import { Prisma, WalletTxType } from '@verris/database';
import { KorektyService } from '../../src/billing/korekty.service';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service';
import { prisma, rozlacz, wyczyscBaze } from './setup';

/**
 * M-06 — faktura korygująca przeciwko prawdziwej bazie.
 *
 * Macierz: „pierwszy zwrot, pierwsza rezygnacja w trakcie okresu, pierwsza
 * literówka w NIP — i operator wychodzi poza system".
 *
 * Testy muszą być integracyjne z trzech powodów, z których każdy dotyczy
 * własności bazy, a nie logiki: atomowości (korekta i zwrot powstają razem
 * albo wcale), osobnego licznika serii VFK i ograniczeń CHECK, które pilnują
 * spójności dokumentu niezależnie od tego, jaki kod go tworzy.
 */

function korekty(): KorektyService {
  const ledger = new WalletLedgerService(prisma() as never);
  return new KorektyService(
    prisma() as never,
    ledger,
    { record: async () => undefined } as never,
  );
}

async function klientZFaktura(saldo: string, brutto: string) {
  const u = await prisma().user.create({
    data: {
      email: `m06-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.verris.pl`,
      passwordHash: 'x',
      walletBalance: new Prisma.Decimal(saldo),
    },
  });
  const b = new Prisma.Decimal(brutto);
  const netto = b.mul(100).dividedBy(123).toDecimalPlaces(2);
  const f = await prisma().invoice.create({
    data: {
      userId: u.id,
      number: `VFV/2026/08/${String(Math.floor(Math.random() * 8999) + 1000)}`,
      status: 'PAID',
      amount: b,
      netAmount: netto,
      vatAmount: b.minus(netto),
      vatRate: new Prisma.Decimal(23),
      currency: 'PLN',
      lineItems: [
        {
          name: 'Abonament Verris Hosting',
          quantity: 1,
          unitNet: netto.toFixed(2),
          vatRate: 23,
          totalNet: netto.toFixed(2),
          totalVat: b.minus(netto).toFixed(2),
          totalGross: b.toFixed(2),
        },
      ] as unknown as Prisma.InputJsonValue,
      buyerSnapshot: { name: 'Klient testowy', nip: '1234563218' },
      issuedAt: new Date('2026-08-10T10:00:00Z'),
      paidAt: new Date('2026-08-10T10:00:00Z'),
      storageKey: 'x/2026/08/faktura.pdf',
    },
  });
  return { user: u, faktura: f };
}

describe('M-06 — faktura korygująca', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('korekta zmniejszająca ZWRACA różnicę do portfela', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');

    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Rezygnacja klienta w połowie okresu rozliczeniowego',
      pozycjePo: [{ nazwa: 'Abonament Verris Hosting', ilosc: 1, cenaBrutto: '61.50' }],
      aktorUserId: user.id,
    });

    expect(k.number).toMatch(/^VFK\/\d{4}\/\d{2}\/\d{4}$/);
    expect(k.zwrot).toBe('61.50');

    const po = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(po.walletBalance.toFixed(2)).toBe('61.50');

    const wpisy = await prisma().walletTransaction.findMany({ where: { userId: user.id } });
    expect(wpisy).toHaveLength(1);
    expect(wpisy[0].type).toBe(WalletTxType.REFUND);
    expect(wpisy[0].invoiceId).toBe(k.id);
  });

  it('dokument korygujący niesie stan przed, po i różnicę', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Rabat przyznany po wystawieniu faktury',
      pozycjePo: [{ nazwa: 'Abonament Verris Hosting', ilosc: 1, cenaBrutto: '100.00' }],
      aktorUserId: user.id,
    });

    const dok = await prisma().invoice.findUniqueOrThrow({ where: { id: k.id } });
    expect(dok.kind).toBe('KOREKTA');
    expect(dok.correctedId).toBe(faktura.id);
    expect(dok.correctionKind).toBe('WARTOSCIOWA');
    expect(dok.correctionReason).toContain('Rabat');
    // `amount` to RÓŻNICA ze znakiem, nie nowa kwota.
    expect(dok.amount.toFixed(2)).toBe('-23.00');
    expect(dok.correctedAmount?.toFixed(2)).toBe('123.00');
    expect(dok.netAmount!.plus(dok.vatAmount!).toFixed(2)).toBe(dok.amount.toFixed(2));
    // Kwota po korekcie odtwarza się z dwóch pól.
    expect(dok.correctedAmount!.plus(dok.amount).toFixed(2)).toBe('100.00');
  });

  it('korekta dostaje osobną serię numeracji, niezależną od faktur', async () => {
    const a = await klientZFaktura('0.00', '123.00');
    const b = await klientZFaktura('0.00', '123.00');
    const s = korekty();

    const k1 = await s.wystaw({
      invoiceId: a.faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Zwrot częściowy — awaria usługi',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
      aktorUserId: a.user.id,
    });
    const k2 = await s.wystaw({
      invoiceId: b.faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Zwrot częściowy — awaria usługi',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
      aktorUserId: b.user.id,
    });

    expect(k1.number.startsWith('VFK/')).toBe(true);
    expect(k2.number.startsWith('VFK/')).toBe(true);
    const n1 = Number(k1.number.split('/')[3]);
    const n2 = Number(k2.number.split('/')[3]);
    expect(n2).toBe(n1 + 1);

    // Licznik faktur (VFV) nie został ruszony.
    const licznikVFV = await prisma().invoiceCounter.findUnique({
      where: { series_year_month: { series: 'VFV', year: 2026, month: 8 } },
    });
    expect(licznikVFV).toBeNull();
  });

  it('korekta do zera zwraca całość', async () => {
    const { user, faktura } = await klientZFaktura('10.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Odstąpienie od umowy w terminie ustawowym',
      pozycjePo: [{ nazwa: 'Abonament Verris Hosting', ilosc: 1, cenaBrutto: '0' }],
      aktorUserId: user.id,
    });
    expect(k.zwrot).toBe('123.00');
    const po = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(po.walletBalance.toFixed(2)).toBe('133.00');
  });

  it('korekta w GÓRĘ nie rusza portfela', async () => {
    // Dopłata to zobowiązanie klienta, nie automatyczne pobranie. Ściąganie
    // pieniędzy z portfela przy korekcie zwiększającej byłoby obciążeniem bez
    // zamówienia.
    const { user, faktura } = await klientZFaktura('500.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Doliczenie usługi pominiętej na fakturze pierwotnej',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '200.00' }],
      aktorUserId: user.id,
    });
    expect(k.zwrot).toBe('0.00');
    const po = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(po.walletBalance.toFixed(2)).toBe('500.00');
    expect(await prisma().walletTransaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('korekta formalna zmienia nabywcę i nie rusza kwot ani portfela', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'FORMALNA',
      przyczyna: 'Literówka w numerze NIP nabywcy',
      nabywcaPo: { name: 'Klient testowy', nip: '5252248481' },
      aktorUserId: user.id,
    });

    const dok = await prisma().invoice.findUniqueOrThrow({ where: { id: k.id } });
    expect(dok.correctionKind).toBe('FORMALNA');
    expect(dok.amount.toFixed(2)).toBe('0.00');
    expect((dok.buyerSnapshot as { nip: string }).nip).toBe('5252248481');
    expect((dok.correctedBuyer as { nip: string }).nip).toBe('1234563218');
    expect(k.zwrot).toBe('0.00');
    const po = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(po.walletBalance.toFixed(2)).toBe('0.00');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Reguły, których pilnuje baza — niezależnie od tego, jaki kod pisze
  // ═══════════════════════════════════════════════════════════════════════

  it('baza odrzuca korektę bez wskazania faktury pierwotnej', async () => {
    const { user } = await klientZFaktura('0.00', '123.00');
    await expect(
      prisma().invoice.create({
        data: {
          userId: user.id,
          number: 'VFK/2026/08/9999',
          kind: 'KOREKTA',
          status: 'PAID',
          amount: new Prisma.Decimal('-10.00'),
          currency: 'PLN',
        },
      }),
    ).rejects.toThrow();
  });

  it('baza odrzuca zwykłą fakturę udającą korektę', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    await expect(
      prisma().invoice.create({
        data: {
          userId: user.id,
          number: 'VFV/2026/08/9998',
          kind: 'VAT',
          correctedId: faktura.id,
          status: 'PAID',
          amount: new Prisma.Decimal('10.00'),
          currency: 'PLN',
        },
      }),
    ).rejects.toThrow();
  });

  it('nie da się skorygować korekty', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Zwrot częściowy po reklamacji',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
      aktorUserId: user.id,
    });

    await expect(
      korekty().wystaw({
        invoiceId: k.id,
        rodzaj: 'WARTOSCIOWA',
        przyczyna: 'Poprawka poprzedniej korekty',
        pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '30.00' }],
        aktorUserId: user.id,
      }),
    ).rejects.toThrow(/korekty/);
  });

  it('korekta bez przyczyny nie powstaje', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    await expect(
      korekty().wystaw({
        invoiceId: faktura.id,
        rodzaj: 'WARTOSCIOWA',
        przyczyna: '   ',
        pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
        aktorUserId: user.id,
      }),
    ).rejects.toThrow(/[Pp]rzyczyna/);
    expect(await prisma().invoice.count({ where: { kind: 'KOREKTA' } })).toBe(0);
  });

  it('nieudana korekta NIE zostawia zwrotu w portfelu', async () => {
    // Atomowość: dokument i pieniądz powstają razem albo wcale. Wymuszamy błąd
    // po stronie dokumentu, podkładając numer, który licznik VFK wyda jako
    // następny.
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    const inny = await prisma().user.create({
      data: { email: `blok-${Date.now()}@test.verris.pl`, passwordHash: 'x' },
    });
    const teraz = new Date();
    const kolidujacy =
      `VFK/${teraz.getFullYear()}/${String(teraz.getMonth() + 1).padStart(2, '0')}/0001`;
    await prisma().invoice.create({
      data: {
        userId: inny.id,
        number: kolidujacy,
        status: 'PAID',
        amount: new Prisma.Decimal('1.00'),
        currency: 'PLN',
      },
    });

    await expect(
      korekty().wystaw({
        invoiceId: faktura.id,
        rodzaj: 'WARTOSCIOWA',
        przyczyna: 'Zwrot po reklamacji — numer zajęty',
        pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
        aktorUserId: user.id,
      }),
    ).rejects.toThrow();

    const po = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(po.walletBalance.toFixed(2)).toBe('0.00');
    expect(await prisma().walletTransaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('korekta czeka na PDF tak jak każdy inny dokument', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '123.00');
    const k = await korekty().wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Zwrot za niedostępność usługi',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' }],
      aktorUserId: user.id,
    });
    const dok = await prisma().invoice.findUniqueOrThrow({ where: { id: k.id } });
    // storageKey === null to sygnał dla schedulera finalizacji — korekta
    // przechodzi tą samą drogą co faktura: PDF, MinIO, KSeF, mail.
    expect(dok.storageKey).toBeNull();
    expect(dok.status).toBe('PAID');
  });

  it('lista korekt do faktury zwraca je w kolejności wystawienia', async () => {
    const { user, faktura } = await klientZFaktura('0.00', '246.00');
    const s = korekty();
    await s.wystaw({
      invoiceId: faktura.id,
      rodzaj: 'WARTOSCIOWA',
      przyczyna: 'Pierwsza korekta — rabat',
      pozycjePo: [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '200.00' }],
      aktorUserId: user.id,
    });
    await s.wystaw({
      invoiceId: faktura.id,
      rodzaj: 'FORMALNA',
      przyczyna: 'Druga korekta — poprawka adresu',
      nabywcaPo: { name: 'Klient testowy', nip: '1234563218', address: 'Nowa 1' },
      aktorUserId: user.id,
    });

    const lista = await s.listaDlaFaktury(faktura.id);
    expect(lista).toHaveLength(2);
    expect(lista[0].correctionReason).toContain('Pierwsza');
    expect(lista[1].correctionReason).toContain('Druga');
  });
});

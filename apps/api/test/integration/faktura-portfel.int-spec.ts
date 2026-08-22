import { Prisma, WalletTxType } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service';
import { okresZbiorczy, refZbiorcza } from '../../src/billing/faktura-za-portfel';
import { prisma, rozlacz, wyczyscBaze } from './setup';

/**
 * Z-01 — faktura za płatność portfelem, przeciwko prawdziwej bazie.
 *
 * Macierz opisała lukę tak: „Klient płaci realnie i nie dostaje ŻADNEGO
 * dokumentu księgowego. Brak obejścia w systemie — operator nie wystawi
 * faktury ręcznie."
 *
 * Testy muszą być integracyjne, bo cała rzecz stoi na trzech własnościach
 * bazy, których atrapa Prismy nie ma: atomowości transakcji (faktura powstaje
 * albo nie powstaje RAZEM z obciążeniem), unikalności pary
 * (provider, providerRef) i atomowości numeratora `INSERT … ON CONFLICT`.
 */

function ledger(): WalletLedgerService {
  return new WalletLedgerService(prisma() as never);
}

async function utworzKlienta(saldo: string) {
  return prisma().user.create({
    data: {
      email: `z01-${Math.floor(Number(saldo) * 1000)}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@test.verris.pl`,
      passwordHash: 'x',
      walletBalance: new Prisma.Decimal(saldo),
    },
  });
}

async function fakturyKlienta(userId: string) {
  return prisma().invoice.findMany({
    where: { userId },
    orderBy: { number: 'asc' },
    include: { walletEntries: { select: { id: true, type: true, amount: true } } },
  });
}

describe('Z-01 — faktura za obciążenie portfela', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('obciążenie za abonament tworzy fakturę VAT w tej samej chwili', async () => {
    const u = await utworzKlienta('100.00');
    const tx = await ledger().debit({
      userId: u.id,
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      amount: '45.00',
      description: 'Abonament Verris Hosting — 1 mies.',
    });

    const [f] = await fakturyKlienta(u.id);
    expect(f).toBeDefined();
    expect(f.status).toBe('PAID');
    expect(f.number).toMatch(/^VFV\/\d{4}\/\d{2}\/\d{4}$/);
    expect(f.amount.toFixed(2)).toBe('45.00');
    expect(f.netAmount?.toFixed(2)).toBe('36.59');
    expect(f.vatAmount?.toFixed(2)).toBe('8.41');
    expect(f.provider).toBe('WALLET');
    expect(f.providerRef).toBe(tx.id);
    // Faktura czeka na PDF — to `storageKey === null` mówi schedulerowi,
    // że jest co dokończyć.
    expect(f.storageKey).toBeNull();
    expect(f.walletEntries.map((w) => w.id)).toEqual([tx.id]);
  });

  it('pozycja faktury bierze opis z obciążenia', async () => {
    const u = await utworzKlienta('200.00');
    await ledger().debit({
      userId: u.id,
      type: WalletTxType.CHARGE_DOMAIN,
      amount: '89.00',
      description: 'Domena przyklad.pl — rejestracja na 1 rok',
    });
    const [f] = await fakturyKlienta(u.id);
    const pozycje = f.lineItems as unknown as Array<{ name: string; totalGross: string }>;
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0].name).toBe('Domena przyklad.pl — rejestracja na 1 rok');
    expect(pozycje[0].totalGross).toBe('89.00');
  });

  it('autoskalowanie NIE dostaje własnej faktury — czeka na zbiorczą', async () => {
    const u = await utworzKlienta('100.00');
    const tx = await ledger().debit({
      userId: u.id,
      type: WalletTxType.CHARGE_AUTOSCALING,
      amount: '0.12',
      description: 'Autoskalowanie — blok 15 min',
    });
    expect(await fakturyKlienta(u.id)).toHaveLength(0);
    const wpis = await prisma().walletTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(wpis.invoiceId).toBeNull();
  });

  it('doładowanie nie tworzy faktury — to wpłata na poczet usług', async () => {
    const u = await utworzKlienta('0.00');
    await ledger().credit({ userId: u.id, type: WalletTxType.TOPUP, amount: '200.00' });
    expect(await fakturyKlienta(u.id)).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Atomowość — sedno Z-01
  // ═══════════════════════════════════════════════════════════════════════

  it('nieudane obciążenie NIE zostawia faktury bez pokrycia', async () => {
    // Gdyby faktura powstawała po transakcji, odrzucone obciążenie zostawiałoby
    // dokument księgowy na usługę, za którą nikt nie zapłacił.
    const u = await utworzKlienta('10.00');
    await expect(
      ledger().debit({
        userId: u.id,
        type: WalletTxType.CHARGE_SUBSCRIPTION,
        amount: '45.00',
      }),
    ).rejects.toThrow();

    expect(await fakturyKlienta(u.id)).toHaveLength(0);
    expect(await prisma().walletTransaction.count({ where: { userId: u.id } })).toBe(0);
    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.walletBalance.toFixed(2)).toBe('10.00');
  });

  it('gdy faktura nie powstanie, pieniądze NIE ruszają się z portfela', async () => {
    // To jest właściwy test atomowości i musiał powstać dopiero za drugim
    // podejściem. Pierwsza wersja sprawdzała odrzucone obciążenie (za małe
    // saldo) i przechodziła RÓWNIEŻ wtedy, gdy faktura powstawała poza
    // transakcją — bo skoro obciążenie rzuciło, do wystawiania faktury i tak
    // nie dochodziło. Test, który przechodzi na obu wersjach kodu, nie mówi
    // nic o żadnej z nich.
    //
    // Tutaj wywala się SAMO wystawianie faktury: podkładamy dokument
    // z numerem, który numerator wyda jako następny, więc `create` odbija się
    // o unikalność `number`. Przy fakturze w transakcji obciążenia całość się
    // cofa. Przy fakturze poza transakcją pieniądze zniknęłyby z portfela,
    // a dokumentu nie byłoby — czyli dokładnie Z-01 z powrotem.
    const u = await utworzKlienta('100.00');
    const teraz = new Date();
    const licznik = await prisma().invoiceCounter.findUnique({
      where: {
        series_year_month: {
          series: 'VFV',
          year: teraz.getFullYear(),
          month: teraz.getMonth() + 1,
        },
      },
    });
    const nastepny = (licznik?.seq ?? 0) + 1;
    const kolidujacy =
      `VFV/${teraz.getFullYear()}/${String(teraz.getMonth() + 1).padStart(2, '0')}/` +
      String(nastepny).padStart(4, '0');

    const inny = await utworzKlienta('0.00');
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
      ledger().debit({
        userId: u.id,
        type: WalletTxType.CHARGE_SUBSCRIPTION,
        amount: '45.00',
        description: 'Abonament — próba przy zajętym numerze',
      }),
    ).rejects.toThrow();

    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.walletBalance.toFixed(2)).toBe('100.00');
    expect(await prisma().walletTransaction.count({ where: { userId: u.id } })).toBe(0);
    expect(await fakturyKlienta(u.id)).toHaveLength(0);
  });

  it('powtórzone obciążenie z tym samym kluczem daje JEDNĄ fakturę', async () => {
    const u = await utworzKlienta('200.00');
    const wej = {
      userId: u.id,
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      amount: '45.00',
      idempotencyKey: 'z01-idem-1',
    };
    const a = await ledger().debit(wej);
    const b = await ledger().debit(wej);

    expect(b.id).toBe(a.id);
    expect(await fakturyKlienta(u.id)).toHaveLength(1);
    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.walletBalance.toFixed(2)).toBe('155.00');
  });

  it('numeracja jest ciągła i bez powtórzeń przy obciążeniach równoległych', async () => {
    // Numerator to `INSERT … ON CONFLICT DO UPDATE RETURNING`. Gdyby ktoś
    // przepisał go na odczyt-plus-zapis, dwie równoległe faktury dostałyby
    // ten sam numer — a numeracja ma być ciągła i bez luk (art. 106e).
    const u = await utworzKlienta('1000.00');
    const l = ledger();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        l.debit({
          userId: u.id,
          type: WalletTxType.CHARGE_USAGE,
          amount: '10.00',
          idempotencyKey: `z01-rownolegle-${i}`,
          description: `Usługa ${i}`,
        }),
      ),
    );

    const f = await fakturyKlienta(u.id);
    expect(f).toHaveLength(8);
    const numery = f.map((x) => x.number);
    expect(new Set(numery).size).toBe(8);
    const kolejne = numery.map((n) => Number(n.split('/')[3]));
    kolejne.sort((a, b) => a - b);
    for (let i = 1; i < kolejne.length; i++) {
      expect(kolejne[i]).toBe(kolejne[i - 1] + 1);
    }
  });

  it('kwota faktury zawsze rozbija się na netto plus VAT', async () => {
    const u = await utworzKlienta('1000.00');
    const l = ledger();
    for (const kwota of ['5.00', '9.99', '45.00', '123.45', '0.07']) {
      await l.debit({
        userId: u.id,
        type: WalletTxType.CHARGE_USAGE,
        amount: kwota,
        idempotencyKey: `z01-vat-${kwota}`,
      });
    }
    // 0,07 jest poniżej progu — idzie na zbiorczą, więc faktur jest cztery.
    const f = await fakturyKlienta(u.id);
    expect(f).toHaveLength(4);
    for (const x of f) {
      expect(x.netAmount!.plus(x.vatAmount!).toFixed(2)).toBe(x.amount.toFixed(2));
    }
  });
});

describe('Z-01 — faktura zbiorcza za miesiąc', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  /**
   * Scheduler faktur zbiorczych, odtworzony wprost na kliencie Prismy.
   *
   * Nie budujemy tu całego `FakturyScheduler` (ciągnie mailer, audyt
   * i InvoicesService z MinIO), tylko przejeżdżamy dokładnie tę samą sekwencję
   * zapytań. Sprawdzamy zachowanie BAZY: unikalność referencji zbiorczej,
   * powiązanie wpisów i sumowanie.
   */
  async function wystawZbiorcza(userId: string, teraz: Date) {
    const okres = okresZbiorczy(teraz);
    const wpisy = await prisma().walletTransaction.findMany({
      where: {
        userId,
        invoiceId: null,
        amount: { lt: 0 },
        createdAt: { gte: okres.od, lt: okres.do },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (wpisy.length === 0) return null;

    const { pozycjeZbiorcze, nadajNumerFaktury } = await import(
      '../../src/billing/faktura-za-portfel'
    );
    const { pozycje, suma } = pozycjeZbiorcze(
      wpisy.map((w) => ({ typ: w.type, brutto: w.amount.abs(), opis: w.description })),
    );
    const ref = refZbiorcza(userId, okres.etykieta);

    return prisma().$transaction(async (tx) => {
      const istnieje = await tx.invoice.findUnique({
        where: { provider_providerRef: { provider: 'WALLET', providerRef: ref } },
        select: { id: true },
      });
      if (istnieje) return istnieje;

      const numer = await nadajNumerFaktury(tx, teraz);
      const f = await tx.invoice.create({
        data: {
          userId,
          number: numer,
          status: 'PAID',
          amount: suma.brutto,
          netAmount: suma.netto,
          vatAmount: suma.vat,
          vatRate: new Prisma.Decimal(23),
          currency: 'PLN',
          provider: 'WALLET',
          providerRef: ref,
          lineItems: pozycje as unknown as Prisma.InputJsonValue,
          issuedAt: teraz,
          paidAt: new Date(okres.do.getTime() - 1000),
        },
        select: { id: true },
      });
      await tx.walletTransaction.updateMany({
        where: { id: { in: wpisy.map((w) => w.id) }, invoiceId: null },
        data: { invoiceId: f.id },
      });
      return f;
    });
  }

  /** Obciążenie z datą wsteczną — scheduler patrzy na poprzedni miesiąc. */
  async function obciazWstecz(userId: string, kwota: string, kiedy: Date, opis: string) {
    const l = ledger();
    const tx = await l.debit({
      userId,
      type: WalletTxType.CHARGE_AUTOSCALING,
      amount: kwota,
      description: opis,
      idempotencyKey: `z01-wstecz-${userId}-${kiedy.getTime()}-${kwota}`,
    });
    await prisma().walletTransaction.update({
      where: { id: tx.id },
      data: { createdAt: kiedy },
    });
    return tx;
  }

  const LIPIEC = new Date('2026-07-15T10:00:00Z');
  const PIERWSZY_SIERPNIA = new Date('2026-08-01T04:00:00Z');

  it('zbiera obciążenia miesiąca w jedną fakturę z pozycjami', async () => {
    const u = await utworzKlienta('100.00');
    await obciazWstecz(u.id, '0.12', LIPIEC, 'Autoskalowanie — blok 15 min');
    await obciazWstecz(u.id, '0.13', LIPIEC, 'Autoskalowanie — blok 15 min');
    await obciazWstecz(u.id, '0.25', LIPIEC, 'Autoskalowanie — blok 15 min');

    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);

    const f = await fakturyKlienta(u.id);
    expect(f).toHaveLength(1);
    expect(f[0].amount.toFixed(2)).toBe('0.50');
    expect(f[0].netAmount!.plus(f[0].vatAmount!).toFixed(2)).toBe('0.50');
    expect(f[0].walletEntries).toHaveLength(3);
    const pozycje = f[0].lineItems as unknown as Array<{ name: string; quantity: number }>;
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0].quantity).toBe(3);
  });

  it('powtórne uruchomienie NIE wystawia drugiej faktury na te same obciążenia', async () => {
    const u = await utworzKlienta('100.00');
    await obciazWstecz(u.id, '1.00', LIPIEC, 'Autoskalowanie — blok 15 min');

    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);
    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);

    expect(await fakturyKlienta(u.id)).toHaveLength(1);
  });

  it('nie obejmuje obciążeń spoza okresu', async () => {
    const u = await utworzKlienta('100.00');
    await obciazWstecz(u.id, '1.00', LIPIEC, 'Autoskalowanie — lipiec');
    await obciazWstecz(u.id, '2.00', new Date('2026-08-05T10:00:00Z'), 'Autoskalowanie — sierpień');

    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);

    const f = await fakturyKlienta(u.id);
    expect(f).toHaveLength(1);
    expect(f[0].amount.toFixed(2)).toBe('1.00');
    expect(f[0].walletEntries).toHaveLength(1);
  });

  it('obciążenie, które dostało własną fakturę, nie trafia na zbiorczą', async () => {
    const u = await utworzKlienta('200.00');
    // Powyżej progu — własna faktura od razu.
    const duze = await ledger().debit({
      userId: u.id,
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      amount: '45.00',
      idempotencyKey: 'z01-duze',
    });
    await prisma().walletTransaction.update({ where: { id: duze.id }, data: { createdAt: LIPIEC } });
    await obciazWstecz(u.id, '0.50', LIPIEC, 'Autoskalowanie — blok 15 min');

    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);

    const f = await fakturyKlienta(u.id);
    expect(f).toHaveLength(2);
    const zbiorcza = f.find((x) => x.providerRef?.startsWith('zbiorcza:'))!;
    expect(zbiorcza.amount.toFixed(2)).toBe('0.50');
    expect(zbiorcza.walletEntries).toHaveLength(1);
  });

  it('żadne obciążenie sprzedażowe nie zostaje bez faktury', async () => {
    // Niezmiennik całego Z-01: po przebiegu zbiorczym w domkniętym miesiącu
    // nie ma obciążenia sprzedażowego z `invoiceId = null`.
    const u = await utworzKlienta('500.00');
    await obciazWstecz(u.id, '0.11', LIPIEC, 'Autoskalowanie — blok 15 min');
    await obciazWstecz(u.id, '0.22', LIPIEC, 'Autoskalowanie — blok 15 min');
    const duze = await ledger().debit({
      userId: u.id,
      type: WalletTxType.CHARGE_DOMAIN,
      amount: '89.00',
      idempotencyKey: 'z01-domena',
    });
    await prisma().walletTransaction.update({ where: { id: duze.id }, data: { createdAt: LIPIEC } });

    await wystawZbiorcza(u.id, PIERWSZY_SIERPNIA);

    const bezFaktury = await prisma().walletTransaction.findMany({
      where: {
        userId: u.id,
        invoiceId: null,
        amount: { lt: 0 },
        createdAt: { gte: new Date('2026-07-01T00:00:00Z'), lt: new Date('2026-08-01T00:00:00Z') },
      },
      select: { id: true, type: true, amount: true },
    });
    expect(
      bezFaktury.length === 0
        ? ''
        : `Obciążenia bez dokumentu księgowego po przebiegu zbiorczym (Z-01):\n` +
          bezFaktury.map((w) => `  ${w.type} ${w.amount.toFixed(2)}`).join('\n'),
    ).toBe('');
  });
});

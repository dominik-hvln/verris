import { Prisma, WalletTxType } from '@verris/database';

/**
 * Z-01 — kiedy obciążenie portfela zamienia się w fakturę.
 *
 * DLACZEGO JEDNO MIEJSCE, A NIE TRZYNAŚCIE
 * ────────────────────────────────────────
 * Obciążeń portfela jest w kodzie trzynaście: odnowienie subskrypcji, zmiana
 * planu, domeny, VPS, monitoring, trial, autoskalowanie, dodatki. Macierz
 * wymieniała cztery — i to nie jest zarzut wobec macierzy, tylko dowód, że
 * lista miejsc, w których rusza się pieniądz, rozjeżdża się z rzeczywistością
 * szybciej, niż ktokolwiek ją aktualizuje.
 *
 * Dopisanie wystawiania faktury w każdym z tych miejsc byłoby czwartym
 * wystąpieniem wzorca, który w tym projekcie wyprodukował już trzy błędy
 * (Z-12, Z-16, plan-change): dwie kopie tej samej reguły, jedna poprawiona,
 * druga zapomniana.
 *
 * Dlatego reguła jest tutaj, a wywołuje ją WYŁĄCZNIE `WalletLedgerService`,
 * który i tak jest jedynym miejscem zmieniającym saldo. Nowe obciążenie
 * dostaje fakturę przez sam fakt bycia obciążeniem — nikt nie musi o niej
 * pamiętać.
 *
 * CO POWSTAJE I KIEDY
 * ───────────────────
 * · sprzedaż jednorazowa i cykliczna (subskrypcja, zmiana planu, domena,
 *   monitoring) → faktura od razu przy obciążeniu,
 * · autoskalowanie i drobne zużycie → jedna faktura zbiorcza na koniec
 *   miesiąca, z pozycjami.
 *
 * Powód rozdziału jest arytmetyczny, nie estetyczny. Autoskalowanie obciąża
 * portfel co blok kilkunastominutowy; faktura za każde obciążenie to
 * kilkadziesiąt dokumentów miesięcznie na klienta — każdy z własnym numerem,
 * PDF-em, mailem i wysyłką do KSeF-a.
 *
 * CZEGO TU NIE MA
 * ───────────────
 * Doładowania portfela. Doładowanie nie jest sprzedażą — to środki na koncie,
 * które klient wyda kiedy zechce i na co zechce. VAT powstaje przy świadczeniu
 * usługi, czyli przy obciążeniu, i tam idzie faktura. Decyzja z 2026-08-22,
 * do potwierdzenia z księgową przed startem sprzedaży (patrz M-18).
 */

/** Stawka VAT dla usług hostingowych w PL. */
export const STAWKA_VAT = 23;

/**
 * Poniżej tej kwoty brutto obciążenie idzie na fakturę zbiorczą.
 *
 * Pięć złotych, bo tyle mniej więcej kosztuje jeden dzień autoskalowania przy
 * typowym przekroczeniu — czyli próg oddziela „klient coś kupił" od „naliczyło
 * się zużycie". Wartość jest do zmiany, ale nie do wyzerowania: próg 0 znaczy
 * fakturę za każdy blok kilkunastominutowy.
 */
export const PROG_FAKTURY_NATYCHMIASTOWEJ = new Prisma.Decimal('5.00');

/** Typy, które są sprzedażą i wymagają dokumentu. */
export const TYPY_SPRZEDAZY: ReadonlySet<WalletTxType> = new Set<WalletTxType>([
  WalletTxType.CHARGE_SUBSCRIPTION,
  WalletTxType.CHARGE_PLAN_UPGRADE,
  WalletTxType.CHARGE_AUTOSCALING,
  WalletTxType.CHARGE_USAGE,
  WalletTxType.CHARGE_DOMAIN,
]);

/**
 * Typy zawsze rozliczane zbiorczo, niezależnie od kwoty.
 *
 * Autoskalowanie mogłoby w skrajnym przypadku przekroczyć próg w jednym bloku
 * (nagły skok na wszystkich trzech zasobach naraz). Faktura za pojedynczy blok
 * kilkunastominutowy byłaby wtedy formalnie poprawna i praktycznie bez sensu —
 * ten sam klient dostałby obok niej fakturę zbiorczą za pozostałe bloki tego
 * samego dnia.
 */
export const TYPY_ZAWSZE_ZBIORCZE: ReadonlySet<WalletTxType> = new Set<WalletTxType>([
  WalletTxType.CHARGE_AUTOSCALING,
]);

export type TrybFaktury = 'natychmiast' | 'zbiorczo' | 'brak';

/**
 * Co zrobić z obciążeniem: wystawić fakturę od razu, odłożyć na zbiorczą,
 * czy nie wystawiać nic.
 *
 * @param typ      typ wpisu w księdze portfela
 * @param brutto   kwota DODATNIA (księga trzyma obciążenia ze znakiem minus,
 *                 tu przychodzi wartość bezwzględna)
 */
export function trybFaktury(typ: WalletTxType, brutto: Prisma.Decimal): TrybFaktury {
  if (!TYPY_SPRZEDAZY.has(typ)) return 'brak';
  if (brutto.lessThanOrEqualTo(0)) return 'brak';
  if (TYPY_ZAWSZE_ZBIORCZE.has(typ)) return 'zbiorczo';
  return brutto.greaterThanOrEqualTo(PROG_FAKTURY_NATYCHMIASTOWEJ) ? 'natychmiast' : 'zbiorczo';
}

export interface RozbicieVat {
  netto: Prisma.Decimal;
  vat: Prisma.Decimal;
  brutto: Prisma.Decimal;
}

/**
 * Rozbicie kwoty BRUTTO na netto i VAT.
 *
 * Ceny w `Plan.priceMonthly` są brutto — tak są pokazywane na stronie i tak je
 * płaci klient. Faktura musi pokazać obie wartości, więc netto liczymy wstecz:
 * netto = brutto × 100 / (100 + stawka), a VAT jest RESZTĄ, nie osobnym
 * zaokrągleniem. Liczenie VAT-u niezależnie (brutto × 23/123) potrafi dać
 * sumę różniącą się od brutto o grosz — a faktura, która się nie sumuje, jest
 * wadliwa.
 */
export function rozbicieVat(brutto: Prisma.Decimal, stawka = STAWKA_VAT): RozbicieVat {
  const b = brutto.toDecimalPlaces(2);
  const netto = b.mul(100).dividedBy(new Prisma.Decimal(100).plus(stawka)).toDecimalPlaces(2);
  return { netto, vat: b.minus(netto), brutto: b };
}

/** Domyślna nazwa pozycji, gdy obciążenie nie niesie własnego opisu. */
export const OPISY_TYPOW: Readonly<Record<string, string>> = {
  CHARGE_SUBSCRIPTION: 'Abonament hostingowy',
  CHARGE_PLAN_UPGRADE: 'Zmiana planu — dopłata proporcjonalna',
  CHARGE_AUTOSCALING: 'Autoskalowanie zasobów',
  CHARGE_USAGE: 'Usługa dodatkowa',
  CHARGE_DOMAIN: 'Domena',
};

export function nazwaPozycji(typ: WalletTxType, opis?: string | null): string {
  const t = opis?.trim();
  if (t) return t.length > 200 ? `${t.slice(0, 197)}…` : t;
  return OPISY_TYPOW[typ] ?? 'Usługa';
}

/**
 * Okres, za który wystawiamy fakturę zbiorczą przy uruchomieniu w `teraz`.
 * Zawsze POPRZEDNI miesiąc kalendarzowy, w całości — job biegnie 1. dnia.
 */
export function okresZbiorczy(teraz: Date): { od: Date; do: Date; etykieta: string } {
  const od = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const doK = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1, 0, 0, 0, 0));
  const mm = String(od.getUTCMonth() + 1).padStart(2, '0');
  return { od, do: doK, etykieta: `${od.getUTCFullYear()}-${mm}` };
}

export interface PozycjaFaktury {
  name: string;
  quantity: number;
  unitNet: string;
  vatRate: number;
  totalNet: string;
  totalVat: string;
  totalGross: string;
}

/**
 * Buduje pozycje faktury zbiorczej i sprawdza, że ich suma zgadza się
 * z sumą obciążeń co do grosza.
 *
 * Rzucamy, gdy się nie zgadza. Faktura, której pozycje nie sumują się do
 * kwoty, jest wadliwym dokumentem księgowym — lepiej, żeby job stanął
 * i ktoś to zobaczył, niż żeby wysłał ją do KSeF-a.
 */
export function pozycjeZbiorcze(
  obciazenia: Array<{ typ: WalletTxType; brutto: Prisma.Decimal; opis?: string | null }>,
): { pozycje: PozycjaFaktury[]; suma: RozbicieVat } {
  const pozycje: PozycjaFaktury[] = [];
  let sumaBrutto = new Prisma.Decimal(0);
  let sumaNetto = new Prisma.Decimal(0);
  let sumaVat = new Prisma.Decimal(0);

  // Grupowanie po nazwie pozycji: „Autoskalowanie zasobów ×43" czyta się
  // lepiej niż czterdzieści trzy identyczne wiersze.
  const wgNazwy = new Map<string, { ile: number; brutto: Prisma.Decimal }>();
  for (const o of obciazenia) {
    const nazwa = nazwaPozycji(o.typ, o.opis);
    const w = wgNazwy.get(nazwa) ?? { ile: 0, brutto: new Prisma.Decimal(0) };
    w.ile += 1;
    w.brutto = w.brutto.plus(o.brutto);
    wgNazwy.set(nazwa, w);
  }

  for (const [nazwa, w] of wgNazwy) {
    const r = rozbicieVat(w.brutto);
    sumaBrutto = sumaBrutto.plus(r.brutto);
    sumaNetto = sumaNetto.plus(r.netto);
    sumaVat = sumaVat.plus(r.vat);
    pozycje.push({
      name: w.ile > 1 ? `${nazwa} (${w.ile}×)` : nazwa,
      quantity: w.ile,
      unitNet: r.netto.dividedBy(w.ile).toDecimalPlaces(2).toFixed(2),
      vatRate: STAWKA_VAT,
      totalNet: r.netto.toFixed(2),
      totalVat: r.vat.toFixed(2),
      totalGross: r.brutto.toFixed(2),
    });
  }

  const oczekiwane = obciazenia
    .reduce((a, o) => a.plus(o.brutto), new Prisma.Decimal(0))
    .toDecimalPlaces(2);
  if (!sumaBrutto.equals(oczekiwane)) {
    throw new Error(
      `Faktura zbiorcza się nie sumuje: pozycje dają ${sumaBrutto.toFixed(2)}, ` +
        `obciążenia ${oczekiwane.toFixed(2)}`,
    );
  }
  if (!sumaNetto.plus(sumaVat).equals(sumaBrutto)) {
    throw new Error(
      `Rozbicie VAT się nie sumuje: ${sumaNetto.toFixed(2)} + ${sumaVat.toFixed(2)} ` +
        `≠ ${sumaBrutto.toFixed(2)}`,
    );
  }

  return { pozycje, suma: { netto: sumaNetto, vat: sumaVat, brutto: sumaBrutto } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zapis — funkcje działające na kliencie transakcji Prismy
// ─────────────────────────────────────────────────────────────────────────────

/** Klient Prismy albo klient transakcji — obie ścieżki muszą działać. */
export type KlientPrismy = Prisma.TransactionClient | {
  $queryRaw: Prisma.TransactionClient['$queryRaw'];
  invoice: Prisma.TransactionClient['invoice'];
  walletTransaction: Prisma.TransactionClient['walletTransaction'];
};

/**
 * Nadaje kolejny numer w serii `VFV/RRRR/MM/{0001}`.
 *
 * Atomowe przez `INSERT … ON CONFLICT DO UPDATE RETURNING` — dwie faktury
 * wystawiane równolegle nigdy nie dostaną tego samego numeru. Seria resetuje
 * się co miesiąc.
 *
 * Ta funkcja jest JEDYNYM miejscem, w którym powstaje numer faktury. Druga
 * kopia tej logiki oznaczałaby dwie serie numeracji rozjeżdżające się przy
 * pierwszym równoległym wystawieniu — a numeracja faktur ma być ciągła
 * i bez luk (art. 106e ust. 1 pkt 2 ustawy o VAT).
 *
 * M-06 — każda seria ma własny licznik. `VFV` dla faktur, `VFK` dla korekt:
 * numer ma mówić, jakim dokumentem jest, zanim ktokolwiek go otworzy.
 */
export const SERIA_FAKTURY = 'VFV';
export const SERIA_KOREKTY = 'VFK';

/**
 * M-02 — strefa, w której liczy się okres numeracji.
 *
 * Do 2026-08-28 `nadajNumerFaktury` brało rok i miesiąc przez
 * `referencja.getFullYear()` / `.getMonth()`, czyli w strefie LOKALNEJ PROCESU.
 * `TZ` nie jest nigdzie w projekcie ustawiane, więc okres numeracji zależał od
 * tego, gdzie kod akurat działa:
 *
 *   Data 2026-08-31T23:59:59Z
 *     • proces w Europe/Warsaw  → wrzesień  (bo lokalnie jest 01:59 dnia 1.09)
 *     • proces w UTC            → sierpień
 *
 * Ta sama faktura dostawała więc różny numer na maszynie dewelopera i na
 * produkcji. Objaw nie występuje codziennie — wyłącznie w oknie granicznym
 * (w Polsce dwie godziny latem, jedna zimą, na przełomie każdego miesiąca) —
 * czyli dokładnie wtedy, gdy fakturowanie zbiorcze i tak się wykonuje.
 *
 * Numeracja jest wymagana jako ciągła w okresie rozliczeniowym
 * (art. 106e ust. 1 pkt 2 ustawy o VAT), a okres rozliczeniowy podatnika w
 * Polsce biegnie w czasie polskim — nie w czasie serwera. Liczymy więc jawnie,
 * zamiast polegać na zmiennej środowiskowej, której nikt nie ustawia.
 *
 * `Intl` zamiast arytmetyki na przesunięciu, bo Polska ma czas letni:
 * stałe +1 albo +2 byłoby poprawne przez pół roku.
 */
export const STREFA_NUMERACJI = 'Europe/Warsaw';

/** Rok i miesiąc okresu numeracji, liczone w strefie polskiej. */
export function okresNumeracji(referencja: Date): { rok: number; miesiac: number } {
  // 'en-CA' daje ISO-podobne RRRR-MM-DD, więc rozbiór jest jednoznaczny.
  const [rok, miesiac] = new Intl.DateTimeFormat('en-CA', {
    timeZone: STREFA_NUMERACJI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(referencja)
    .split('-')
    .map(Number);

  return { rok, miesiac };
}

export async function nadajNumerFaktury(
  db: KlientPrismy,
  referencja: Date,
  seria: string = SERIA_FAKTURY,
): Promise<string> {
  const { rok, miesiac } = okresNumeracji(referencja);
  const rows = await db.$queryRaw<Array<{ seq: number }>>`
    INSERT INTO "InvoiceCounter" ("id", "series", "year", "month", "seq", "updatedAt")
    VALUES (gen_random_uuid(), ${seria}, ${rok}, ${miesiac}, 1, NOW())
    ON CONFLICT ("series", "year", "month")
    DO UPDATE SET "seq" = "InvoiceCounter"."seq" + 1, "updatedAt" = NOW()
    RETURNING "seq";
  `;
  const seq = rows[0]?.seq ?? 1;
  return `${seria}/${rok}/${String(miesiac).padStart(2, '0')}/${String(seq).padStart(4, '0')}`;
}

/** Dostawca dla faktur powstających z obciążenia portfela. */
export const DOSTAWCA_PORTFEL = 'WALLET';
/** Dostawca dla faktur wystawianych ręcznie przez operatora. */
export const DOSTAWCA_RECZNY = 'MANUAL';

export interface DaneFakturyZaObciazenie {
  userId: string;
  walletTxId: string;
  typ: WalletTxType;
  /** Kwota DODATNIA brutto. */
  brutto: Prisma.Decimal;
  waluta: string;
  opis?: string | null;
  subscriptionId?: string | null;
  teraz: Date;
}

/**
 * Zakłada fakturę za pojedyncze obciążenie — W TEJ SAMEJ TRANSAKCJI, w której
 * rusza się pieniądz.
 *
 * To jest cała odpowiedź na Z-01 i zarazem lekcja z Z-05: dokument, którego
 * powstanie zależy od tego, czy jakiś krok po transakcji się powiedzie, będzie
 * czasem nie powstawał — i nikt się o tym nie dowie. Wiersz faktury powstaje
 * atomowo z obciążeniem; wszystko, co wymaga świata zewnętrznego (PDF, MinIO,
 * KSeF, mail), robi później scheduler, z ponawianiem.
 *
 * Faktura ma od razu status PAID, bo pieniądze zostały już pobrane z portfela.
 * `storageKey` zostaje NULL — to on mówi schedulerowi, że jest co dokończyć.
 */
export async function utworzFaktureZaObciazenie(
  db: KlientPrismy,
  d: DaneFakturyZaObciazenie,
): Promise<{ id: string; number: string }> {
  const r = rozbicieVat(d.brutto);
  const numer = await nadajNumerFaktury(db, d.teraz);
  const nazwa = nazwaPozycji(d.typ, d.opis);
  const pozycje: PozycjaFaktury[] = [
    {
      name: nazwa,
      quantity: 1,
      unitNet: r.netto.toFixed(2),
      vatRate: STAWKA_VAT,
      totalNet: r.netto.toFixed(2),
      totalVat: r.vat.toFixed(2),
      totalGross: r.brutto.toFixed(2),
    },
  ];

  const faktura = await db.invoice.create({
    data: {
      userId: d.userId,
      subscriptionId: d.subscriptionId ?? null,
      number: numer,
      status: 'PAID',
      amount: r.brutto,
      netAmount: r.netto,
      vatAmount: r.vat,
      vatRate: new Prisma.Decimal(STAWKA_VAT),
      currency: d.waluta,
      // Para (provider, providerRef) jest unikalna — dwukrotne wywołanie dla
      // tego samego wpisu księgi odbije się o ograniczenie bazy zamiast
      // wystawić drugą fakturę na to samo.
      provider: DOSTAWCA_PORTFEL,
      providerRef: d.walletTxId,
      lineItems: pozycje as unknown as Prisma.InputJsonValue,
      issuedAt: d.teraz,
      paidAt: d.teraz,
    },
    select: { id: true, number: true },
  });

  await db.walletTransaction.update({
    where: { id: d.walletTxId },
    data: { invoiceId: faktura.id },
  });

  return faktura;
}

/** Referencja faktury zbiorczej — stała dla pary (klient, miesiąc). */
export function refZbiorcza(userId: string, etykietaOkresu: string): string {
  return `zbiorcza:${userId}:${etykietaOkresu}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalizacja — ponawianie i alarmowanie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Odstępy ponowień finalizacji, w minutach.
 *
 * Rzadziej niż przy webhooku płatności (Z-05) i to jest celowe: tam brakowało
 * PIENIĘDZY na koncie klienta, tu brakuje DOKUMENTU przy poprawnie pobranych
 * pieniądzach. Ustawa daje na wystawienie faktury czas do 15. dnia następnego
 * miesiąca, więc godziny są w porządku, a rzadsze próby nie dobijają MinIO
 * ani KSeF-a w trakcie ich własnej awarii.
 */
export const ODSTEPY_PONOWIEN_FAKTURY_MIN = [2, 10, 30, 120] as const;

/** Po tylu nieudanych próbach finalizacji faktura budzi adminów. */
export const PROG_ALERTU_FAKTURY = 3;

/** Ponowny alert o tej samej fakturze nie częściej niż raz na dobę. */
export const ODSTEP_PONOWNEGO_ALERTU_FAKTURY_MS = 24 * 60 * 60 * 1000;

export function nastepnaProbaFaktury(proba: number, teraz: Date): Date {
  const i = Math.min(Math.max(proba, 1), ODSTEPY_PONOWIEN_FAKTURY_MIN.length) - 1;
  return new Date(teraz.getTime() + ODSTEPY_PONOWIEN_FAKTURY_MIN[i] * 60 * 1000);
}

export function czyAlarmowacOFakturze(
  s: { finalizeAttempts: number; finalizeAlertedAt: Date | null },
  teraz: Date,
): boolean {
  if (s.finalizeAttempts < PROG_ALERTU_FAKTURY) return false;
  if (
    s.finalizeAlertedAt &&
    teraz.getTime() - s.finalizeAlertedAt.getTime() < ODSTEP_PONOWNEGO_ALERTU_FAKTURY_MS
  ) {
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Faktura wystawiana ręcznie przez operatora
// ─────────────────────────────────────────────────────────────────────────────

export interface PozycjaReczna {
  nazwa: string;
  ilosc: number;
  /** Cena BRUTTO za sztukę. */
  cenaBrutto: Prisma.Decimal | number | string;
}

/**
 * Przelicza pozycje podane brutto na format faktury i sprawdza sumowanie.
 *
 * Kwoty podaje się brutto, bo tak wygląda cały ten system: cennik, strona
 * i koszyk operują na brutto. Operator przeliczający netto w pamięci prędzej
 * czy później pomyli się o grosz, a to jest dokument księgowy.
 *
 * VAT jest RESZTĄ po odjęciu netto od brutto — na poziomie pozycji i na
 * poziomie sumy. Liczony niezależnie potrafiłby dać sumę różniącą się od
 * brutto o grosz, a wtedy faktura się nie zgadza.
 */
export function pozycjeReczne(pozycje: PozycjaReczna[]): {
  pozycje: PozycjaFaktury[];
  suma: RozbicieVat;
} {
  if (pozycje.length === 0) throw new Error('Faktura bez pozycji nie jest fakturą');

  const wynik: PozycjaFaktury[] = [];
  let sumaBrutto = new Prisma.Decimal(0);
  let sumaNetto = new Prisma.Decimal(0);
  let sumaVat = new Prisma.Decimal(0);

  for (const p of pozycje) {
    if (!Number.isInteger(p.ilosc) || p.ilosc < 1) {
      throw new Error(`Ilość musi być dodatnią liczbą całkowitą, jest: ${p.ilosc}`);
    }
    const jednostkowaBrutto = new Prisma.Decimal(p.cenaBrutto).toDecimalPlaces(2);
    if (jednostkowaBrutto.lessThanOrEqualTo(0)) {
      throw new Error(`Cena musi być dodatnia, jest: ${jednostkowaBrutto.toFixed(2)}`);
    }
    // Brutto pozycji liczymy z ceny jednostkowej i ilości, a netto z brutto —
    // nie odwrotnie. Mnożenie zaokrąglonego netto przez ilość rozjeżdża sumę
    // przy większych ilościach.
    const pozBrutto = jednostkowaBrutto.mul(p.ilosc).toDecimalPlaces(2);
    const r = rozbicieVat(pozBrutto);

    sumaBrutto = sumaBrutto.plus(r.brutto);
    sumaNetto = sumaNetto.plus(r.netto);
    sumaVat = sumaVat.plus(r.vat);

    wynik.push({
      name: p.nazwa,
      quantity: p.ilosc,
      unitNet: r.netto.dividedBy(p.ilosc).toDecimalPlaces(2).toFixed(2),
      vatRate: STAWKA_VAT,
      totalNet: r.netto.toFixed(2),
      totalVat: r.vat.toFixed(2),
      totalGross: r.brutto.toFixed(2),
    });
  }

  if (!sumaNetto.plus(sumaVat).equals(sumaBrutto)) {
    throw new Error(
      `Rozbicie VAT się nie sumuje: ${sumaNetto.toFixed(2)} + ${sumaVat.toFixed(2)} ` +
        `≠ ${sumaBrutto.toFixed(2)}`,
    );
  }

  return { pozycje: wynik, suma: { netto: sumaNetto, vat: sumaVat, brutto: sumaBrutto } };
}

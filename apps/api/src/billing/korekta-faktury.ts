import { Prisma } from '@verris/database';
import {
  PozycjaFaktury,
  RozbicieVat,
  rozbicieVat,
  STAWKA_VAT,
} from './faktura-za-portfel';

/**
 * M-06 — faktura korygująca.
 *
 * CO BYŁO
 * ───────
 * Zero wystąpień korekty w całym `apps/api` i w schemacie. Builder KSeF-a
 * wpisywał `<RodzajFaktury>VAT</RodzajFaktury>` na sztywno. Pierwszy zwrot,
 * pierwsza rezygnacja w trakcie okresu i pierwsza literówka w NIP-ie
 * wypychały operatora poza system — do Worda i własnej numeracji.
 *
 * DWA RODZAJE, BO MECHANIKA JEST INNA
 * ───────────────────────────────────
 * · WARTOŚCIOWA — zmienia kwoty (zwrot, rezygnacja, rabat po fakturze).
 *   Dokument pokazuje stan przed, stan po i RÓŻNICĘ. Różnica ujemna oznacza
 *   pieniądze wracające do klienta.
 * · FORMALNA — poprawia dane nabywcy (literówka w NIP, zmiana adresu).
 *   Kwoty bez zmian, różnica zero.
 *
 * CO SIEDZI W `amount` KOREKTY
 * ────────────────────────────
 * RÓŻNICA, ze znakiem — nie nowa kwota. To ona wchodzi do rejestru VAT i to ona
 * mówi, ile pieniędzy się rusza. Kwoty przed korektą stoją obok, w polach
 * `corrected*`, a pozycje po korekcie w `lineItems`.
 *
 * Alternatywa — trzymanie w `amount` nowej kwoty — wyglądałaby naturalniej na
 * ekranie i psuła wszystko poniżej: sumowanie rejestru, asercję
 * `netto + VAT = brutto` i oczywistość tego, czy dokument oddaje pieniądze,
 * czy dobiera.
 */

export type RodzajKorekty = 'WARTOSCIOWA' | 'FORMALNA';

export interface StanFaktury {
  amount: Prisma.Decimal;
  netAmount: Prisma.Decimal | null;
  vatAmount: Prisma.Decimal | null;
  lineItems: unknown;
  buyerSnapshot: unknown;
  kind: string;
  status: string;
  currency: string;
}

export interface PozycjaKorekty {
  nazwa: string;
  ilosc: number;
  /** Cena BRUTTO za sztukę PO korekcie. */
  cenaBrutto: Prisma.Decimal | number | string;
}

export interface WynikKorekty {
  pozycjePo: PozycjaFaktury[];
  przed: RozbicieVat;
  po: RozbicieVat;
  roznica: RozbicieVat;
}

/** Powód, dla którego danej faktury nie wolno skorygować. */
export function bladKorygowalnosci(f: StanFaktury): string | null {
  if (f.kind === 'KOREKTA') {
    // Prawo dopuszcza korektę korekty, ale wtedy dokument odnosi się do
    // dokumentu, który sam już coś zmienia — a wyliczenie „ile ostatecznie
    // wyszło" przestaje być odczytem dwóch pól. Do czasu, gdy pojawi się realny
    // przypadek, wolę odmówić niż wystawić dokument, którego nie umiem policzyć.
    return 'Nie koryguje się korekty. Skoryguj fakturę pierwotną albo wystaw korektę do niej.';
  }
  if (f.status === 'DRAFT') {
    return 'Faktura w wersji roboczej nie została wprowadzona do obrotu — popraw ją zamiast korygować.';
  }
  if (f.status === 'VOID') {
    return 'Faktura anulowana nie podlega korekcie.';
  }
  return null;
}

/**
 * Przelicza korektę wartościową: pozycje po zmianie, kwoty przed, po i różnicę.
 *
 * Kwoty podaje się BRUTTO — tak jak wszędzie w tym systemie. VAT jest resztą
 * po odjęciu netto od brutto, na każdym z trzech poziomów, bo faktura, która
 * się nie sumuje, jest wadliwym dokumentem.
 */
export function przeliczKorekte(
  przedStan: StanFaktury,
  pozycjePo: PozycjaKorekty[],
): WynikKorekty {
  if (pozycjePo.length === 0) {
    // Korekta „do zera" jest zwykłym przypadkiem (pełny zwrot), ale zapisuje
    // się ją jako pozycję z kwotą zero, nie jako brak pozycji. Dokument bez
    // pozycji nie mówi, CZEGO dotyczy.
    throw new Error(
      'Korekta bez pozycji nie jest dokumentem. Dla pełnego zwrotu podaj pozycje z kwotą 0,00.',
    );
  }

  const przed: RozbicieVat = {
    brutto: przedStan.amount.toDecimalPlaces(2),
    netto: (przedStan.netAmount ?? rozbicieVat(przedStan.amount).netto).toDecimalPlaces(2),
    vat: (przedStan.vatAmount ?? rozbicieVat(przedStan.amount).vat).toDecimalPlaces(2),
  };

  const pozycje: PozycjaFaktury[] = [];
  let poBrutto = new Prisma.Decimal(0);
  let poNetto = new Prisma.Decimal(0);
  let poVat = new Prisma.Decimal(0);

  for (const p of pozycjePo) {
    if (!Number.isInteger(p.ilosc) || p.ilosc < 1) {
      throw new Error(`Ilość musi być dodatnią liczbą całkowitą, jest: ${p.ilosc}`);
    }
    const jednostkowa = new Prisma.Decimal(p.cenaBrutto).toDecimalPlaces(2);
    if (jednostkowa.isNegative()) {
      throw new Error(`Cena po korekcie nie może być ujemna, jest: ${jednostkowa.toFixed(2)}`);
    }
    const brutto = jednostkowa.mul(p.ilosc).toDecimalPlaces(2);
    const r = rozbicieVat(brutto);
    poBrutto = poBrutto.plus(r.brutto);
    poNetto = poNetto.plus(r.netto);
    poVat = poVat.plus(r.vat);
    pozycje.push({
      name: p.nazwa,
      quantity: p.ilosc,
      unitNet: r.netto.dividedBy(p.ilosc).toDecimalPlaces(2).toFixed(2),
      vatRate: STAWKA_VAT,
      totalNet: r.netto.toFixed(2),
      totalVat: r.vat.toFixed(2),
      totalGross: r.brutto.toFixed(2),
    });
  }

  const po: RozbicieVat = { brutto: poBrutto, netto: poNetto, vat: poVat };
  const roznica: RozbicieVat = {
    brutto: po.brutto.minus(przed.brutto),
    netto: po.netto.minus(przed.netto),
    vat: po.vat.minus(przed.vat),
  };

  if (roznica.brutto.isZero()) {
    throw new Error(
      'Korekta wartościowa, która niczego nie zmienia, nie jest korektą. ' +
        'Do poprawy danych nabywcy użyj korekty formalnej.',
    );
  }
  if (!roznica.netto.plus(roznica.vat).equals(roznica.brutto)) {
    throw new Error(
      `Różnica się nie sumuje: ${roznica.netto.toFixed(2)} + ${roznica.vat.toFixed(2)} ` +
        `≠ ${roznica.brutto.toFixed(2)}`,
    );
  }

  return { pozycjePo: pozycje, przed, po, roznica };
}

/**
 * Korekta formalna: kwoty bez zmian, zmieniają się dane nabywcy.
 *
 * Zwraca zerową różnicę — i to jest istotne, bo dokument o zerowej wartości
 * wchodzi do rejestru VAT bez wpływu na rozliczenie, a właśnie o to chodzi.
 */
export function korektaFormalna(przedStan: StanFaktury): WynikKorekty {
  const przed: RozbicieVat = {
    brutto: przedStan.amount.toDecimalPlaces(2),
    netto: (przedStan.netAmount ?? rozbicieVat(przedStan.amount).netto).toDecimalPlaces(2),
    vat: (przedStan.vatAmount ?? rozbicieVat(przedStan.amount).vat).toDecimalPlaces(2),
  };
  const zero = new Prisma.Decimal(0);
  return {
    pozycjePo: (przedStan.lineItems as PozycjaFaktury[] | null) ?? [],
    przed,
    po: przed,
    roznica: { brutto: zero, netto: zero, vat: zero },
  };
}

/** Ile pieniędzy wraca do klienta. Zero, gdy korekta dobiera albo nie zmienia. */
export function kwotaDoZwrotu(roznica: RozbicieVat): Prisma.Decimal {
  return roznica.brutto.isNegative() ? roznica.brutto.abs() : new Prisma.Decimal(0);
}

/** Ile klient ma dopłacić. Zero, gdy korekta zwraca albo nie zmienia. */
export function kwotaDoDoplaty(roznica: RozbicieVat): Prisma.Decimal {
  return roznica.brutto.greaterThan(0) ? roznica.brutto : new Prisma.Decimal(0);
}

/**
 * Opis dokumentu do dziennika i do maila.
 *
 * Świadomie po polsku i pełnym zdaniem — ten tekst czyta człowiek szukający
 * w audycie, dlaczego klientowi wróciły pieniądze.
 */
export function opisKorekty(
  rodzaj: RodzajKorekty,
  numerPierwotnej: string,
  roznica: RozbicieVat,
  waluta: string,
): string {
  if (rodzaj === 'FORMALNA') {
    return `Korekta danych nabywcy do faktury ${numerPierwotnej}`;
  }
  const zwrot = kwotaDoZwrotu(roznica);
  if (zwrot.greaterThan(0)) {
    return `Korekta faktury ${numerPierwotnej} — zwrot ${zwrot.toFixed(2)} ${waluta}`;
  }
  return `Korekta faktury ${numerPierwotnej} — dopłata ${roznica.brutto.toFixed(2)} ${waluta}`;
}

import { XMLParser } from 'fast-xml-parser';

/**
 * Model wizualizacji e-faktury FA(3) — JEDYNE źródło danych dla PDF-a faktury z KSeF.
 *
 * Powstaje WYŁĄCZNIE z zapisanego XML-a, czyli z dokładnie tych bajtów, które poszły
 * do KSeF (decyzja właściciela 2026-10-12: treść PDF = treść faktury w KSeF). Nie
 * czyta snapshotów faktury z bazy — gdyby czytał, PDF mógłby pokazać coś, czego
 * w KSeF nie ma (np. e-mail nabywcy, VAT w wierszu, termin płatności).
 *
 * Nazwy pól FA(3) wg XSD 1-0E:
 * https://github.com/CIRFMF/ksef-docs/blob/main/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd
 */

export interface PodmiotWiz {
  nip: string | null;
  /** `BrakID=1` — podmiot bez identyfikatora podatkowego (np. osoba prywatna). */
  brakId: boolean;
  nazwa: string | null;
  kodKraju: string | null;
  adresL1: string | null;
  adresL2: string | null;
  email: string | null;
  /** Podmiot2: JST/GV (1 — dotyczy, 2 — nie dotyczy). */
  jst: string | null;
  gv: string | null;
}

export interface WierszWiz {
  nr: string;
  nazwa: string | null;
  jednostka: string | null;
  ilosc: string | null;
  cenaNetto: string | null;
  wartoscNetto: string | null;
  stawka: string | null;
  /** Wiersz stanu sprzed korekty (`StanPrzed=1`). */
  stanPrzed: boolean;
}

export interface SumaStawkiWiz {
  /** Sufiks pola: `1` → P_13_1/P_14_1. */
  pole: string;
  etykieta: string;
  netto: string;
  vat: string | null;
}

export interface AdnotacjaWiz {
  pole: string;
  wartosc: string;
  /** Tekst do wydruku — `null`, gdy wartość oznacza „nie dotyczy” (nic się nie drukuje). */
  tekst: string | null;
}

export interface FakturaKorygowanaWiz {
  data: string;
  numer: string;
  numerKsef: string | null;
  /** `NrKSeFN=1` — faktura korygowana wystawiona poza KSeF. */
  pozaKsef: boolean;
}

export interface WizualizacjaFa3 {
  naglowek: {
    kodFormularza: string | null;
    kodSystemowy: string | null;
    wersjaSchemy: string | null;
    wariant: string | null;
    dataWytworzenia: string | null;
    systemInfo: string | null;
  };
  rodzaj: string;
  numer: string;
  waluta: string;
  dataWystawienia: string;
  dataSprzedazy: string | null;
  sprzedawca: PodmiotWiz;
  nabywca: PodmiotWiz;
  sumy: SumaStawkiWiz[];
  razem: string;
  adnotacje: AdnotacjaWiz[];
  korekta: {
    przyczyna: string | null;
    typ: string | null;
    typOpis: string | null;
    faktury: FakturaKorygowanaWiz[];
  } | null;
  wiersze: WierszWiz[];
  platnosc: {
    zaplacono: boolean;
    dataZaplaty: string | null;
    formaKod: string | null;
    formaOpis: string | null;
    rachunki: string[];
    terminy: string[];
  } | null;
}

export class WizualizacjaFa3Error extends Error {}

/** TFormaPlatnosci (XSD FA(3)). */
export const FORMY_PLATNOSCI: Record<string, string> = {
  '1': 'gotówka',
  '2': 'karta',
  '3': 'bon',
  '4': 'czek',
  '5': 'kredyt',
  '6': 'przelew',
  '7': 'płatność mobilna',
};

/** TTypKorekty (XSD FA(3)). */
export const TYPY_KOREKTY: Record<string, string> = {
  '1': 'skutek w dacie ujęcia faktury pierwotnej',
  '2': 'skutek w dacie wystawienia faktury korygującej',
  '3': 'skutek w innej dacie',
};

/** Etykiety grup sum P_13_x (opisy pól w XSD FA(3)). */
const ETYKIETY_SUM: Record<string, string> = {
  '1': 'stawka podstawowa (23% / 22%)',
  '2': 'stawka obniżona (8% / 7%)',
  '3': 'stawka obniżona (5%)',
};

/** Adnotacje z wartością „1” = tekst ustawowy na fakturze; „2” = nie dotyczy. */
const ADNOTACJE_TAK_NIE: Array<[string, string]> = [
  ['P_16', 'metoda kasowa'],
  ['P_17', 'samofakturowanie'],
  ['P_18', 'odwrotne obciążenie'],
  ['P_18A', 'mechanizm podzielonej płatności'],
  ['P_23', 'procedura uproszczona (art. 135 ust. 1 pkt 4 lit. b i c ustawy)'],
];

const POWTARZALNE = new Set(['FaWiersz', 'DaneFaKorygowanej', 'TerminPlatnosci', 'RachunekBankowy', 'DaneKontaktowe']);

export function parsujFa3(xml: string): Record<string, unknown> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    // Wartości zostają napisami 1:1 z XML-a — parsowanie liczb zjadałoby zera („100.00” → 100).
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    isArray: (nazwa) => POWTARZALNE.has(nazwa),
  });
  const wynik = parser.parse(xml) as Record<string, unknown>;
  const faktura = wynik.Faktura as Record<string, unknown> | undefined;
  if (!faktura || typeof faktura !== 'object') {
    throw new WizualizacjaFa3Error('To nie jest dokument FA(3) — brak elementu Faktura.');
  }
  return faktura;
}

type Obiekt = Record<string, unknown>;
const obj = (v: unknown): Obiekt => (v && typeof v === 'object' ? (v as Obiekt) : {});
const txt = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  // Element z atrybutem (np. KodFormularza) — wartość pod `#text`.
  const t = (v as Obiekt)['#text'];
  return typeof t === 'string' ? t : null;
};
const lista = (v: unknown): Obiekt[] => (Array.isArray(v) ? v.map(obj) : v ? [obj(v)] : []);

function podmiot(p: Obiekt): PodmiotWiz {
  const id = obj(p.DaneIdentyfikacyjne);
  const adres = obj(p.Adres);
  const kontakt = lista(p.DaneKontaktowe)[0] ?? {};
  return {
    nip: txt(id.NIP),
    brakId: txt(id.BrakID) === '1',
    nazwa: txt(id.Nazwa),
    kodKraju: txt(adres.KodKraju),
    adresL1: txt(adres.AdresL1),
    adresL2: txt(adres.AdresL2),
    email: txt(kontakt.Email),
    jst: txt(p.JST),
    gv: txt(p.GV),
  };
}

export function wizualizacjaFa3(xml: string): WizualizacjaFa3 {
  const f = parsujFa3(xml);
  const nag = obj(f.Naglowek);
  const fa = obj(f.Fa);
  const numer = txt(fa.P_2);
  const data = txt(fa.P_1);
  const razem = txt(fa.P_15);
  if (!numer || !data || razem == null) {
    throw new WizualizacjaFa3Error('Dokument FA(3) bez numeru (P_2), daty (P_1) albo kwoty (P_15).');
  }

  const sumy: SumaStawkiWiz[] = [];
  for (const pole of ['1', '2', '3']) {
    const netto = txt(fa[`P_13_${pole}`]);
    if (netto == null) continue;
    sumy.push({ pole, etykieta: ETYKIETY_SUM[pole], netto, vat: txt(fa[`P_14_${pole}`]) });
  }

  const adn = obj(fa.Adnotacje);
  const adnotacje: AdnotacjaWiz[] = ADNOTACJE_TAK_NIE.filter(([pole]) => adn[pole] != null).map(
    ([pole, tekst]) => {
      const wartosc = txt(adn[pole]) ?? '';
      return { pole, wartosc, tekst: wartosc === '1' ? tekst : null };
    },
  );
  const zw = obj(adn.Zwolnienie);
  if (zw.P_19N != null) adnotacje.push({ pole: 'P_19N', wartosc: txt(zw.P_19N) ?? '', tekst: null });
  if (zw.P_19 != null) {
    const podstawa = txt(zw.P_19A) ?? txt(zw.P_19B) ?? txt(zw.P_19C);
    adnotacje.push({ pole: 'P_19', wartosc: txt(zw.P_19) ?? '', tekst: `zwolnienie z VAT${podstawa ? ` — ${podstawa}` : ''}` });
  }
  const nst = obj(adn.NoweSrodkiTransportu);
  if (nst.P_22N != null) adnotacje.push({ pole: 'P_22N', wartosc: txt(nst.P_22N) ?? '', tekst: null });
  const marza = obj(adn.PMarzy);
  if (marza.P_PMarzyN != null) adnotacje.push({ pole: 'P_PMarzyN', wartosc: txt(marza.P_PMarzyN) ?? '', tekst: null });

  const rodzaj = txt(fa.RodzajFaktury) ?? 'VAT';
  const faKor = lista(fa.DaneFaKorygowanej);
  const typ = txt(fa.TypKorekty);
  const korekta =
    rodzaj === 'KOR' || faKor.length
      ? {
          przyczyna: txt(fa.PrzyczynaKorekty),
          typ,
          typOpis: typ ? TYPY_KOREKTY[typ] ?? null : null,
          faktury: faKor.map((k) => ({
            data: txt(k.DataWystFaKorygowanej) ?? '',
            numer: txt(k.NrFaKorygowanej) ?? '',
            numerKsef: txt(k.NrKSeFFaKorygowanej),
            pozaKsef: txt(k.NrKSeFN) === '1',
          })),
        }
      : null;

  const wiersze: WierszWiz[] = lista(fa.FaWiersz).map((w) => ({
    nr: txt(w.NrWierszaFa) ?? '',
    nazwa: txt(w.P_7),
    jednostka: txt(w.P_8A),
    ilosc: txt(w.P_8B),
    cenaNetto: txt(w.P_9A),
    wartoscNetto: txt(w.P_11),
    stawka: txt(w.P_12),
    stanPrzed: txt(w.StanPrzed) === '1',
  }));

  const pl = fa.Platnosc == null ? null : obj(fa.Platnosc);
  const platnosc = pl
    ? {
        zaplacono: txt(pl.Zaplacono) === '1',
        dataZaplaty: txt(pl.DataZaplaty),
        formaKod: txt(pl.FormaPlatnosci),
        formaOpis: txt(pl.OpisPlatnosci),
        rachunki: lista(pl.RachunekBankowy).map((r) => txt(r.NrRB) ?? '').filter(Boolean),
        terminy: lista(pl.TerminPlatnosci).map((t) => txt(t.Termin) ?? '').filter(Boolean),
      }
    : null;

  const kod = nag.KodFormularza;
  return {
    naglowek: {
      kodFormularza: txt(kod),
      kodSystemowy: txt(obj(kod)['@kodSystemowy']),
      wersjaSchemy: txt(obj(kod)['@wersjaSchemy']),
      wariant: txt(nag.WariantFormularza),
      dataWytworzenia: txt(nag.DataWytworzeniaFa),
      systemInfo: txt(nag.SystemInfo),
    },
    rodzaj,
    numer,
    waluta: txt(fa.KodWaluty) ?? 'PLN',
    dataWystawienia: data,
    dataSprzedazy: txt(fa.P_6),
    sprzedawca: podmiot(obj(f.Podmiot1)),
    nabywca: podmiot(obj(f.Podmiot2)),
    sumy,
    razem,
    adnotacje,
    korekta,
    wiersze,
    platnosc,
  };
}

import {
  FAKTURY_TESTOWE,
  fakturaB2B,
  fakturaB2C,
  korekta,
  NIP_NABYWCY,
  xmlFaktury,
} from '../test/faktury-ksef-testowe.js';
import { kwotaPl, renderujFaktureKsefZTekstem, stawkaPl, type MetaKsef } from './faktura-ksef-pdf.js';
import { linkWeryfikacjiKsef, skrotFakturyBase64Url } from './kod-qr-ksef.js';
import { FORMY_PLATNOSCI, parsujFa3, wizualizacjaFa3, type WizualizacjaFa3 } from './wizualizacja-fa3.js';

/**
 * KSeF 12.10 — spójność XML ↔ PDF (decyzja właściciela: PDF ma treść faktury z KSeF).
 *
 * Dwa ogniwa, oba wymuszone:
 *  1. XML → model wizualizacji: KAŻDE pole (liść) XML-a ma odpowiednik w modelu z tą samą
 *     wartością. Nowe pole w builderze bez odwzorowania w modelu = czerwony test.
 *  2. model → PDF: każda drukowana wartość modelu jest w tekście narysowanym na PDF-ie
 *     (renderer zapisuje każdy `drawText`). PDF nie ma innego źródła danych niż model.
 */

interface Lisc {
  sciezka: string;
  indeksy: number[];
  wartosc: string;
}

function liscie(o: unknown, sciezka = '', indeksy: number[] = []): Lisc[] {
  if (typeof o === 'string') return [{ sciezka, indeksy, wartosc: o }];
  if (Array.isArray(o)) return o.flatMap((e, i) => liscie(e, sciezka, [...indeksy, i]));
  if (o && typeof o === 'object') {
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => {
      if (k === '#text') return liscie(v, sciezka, indeksy);
      const p = sciezka ? `${sciezka}.${k}` : k;
      return liscie(v, p, indeksy);
    });
  }
  return [];
}

type Odczyt = (w: WizualizacjaFa3, i: number[]) => string | null | undefined;
const tak = (b: boolean | undefined) => (b ? '1' : null);
const suma = (pole: string, co: 'netto' | 'vat'): Odczyt => (w) => w.sumy.find((s) => s.pole === pole)?.[co];
const adn = (pole: string): Odczyt => (w) => w.adnotacje.find((a) => a.pole === pole)?.wartosc;

/** Pole FA(3) → wartość w modelu wizualizacji. */
const ODWZOROWANIE: Record<string, Odczyt> = {
  'Naglowek.KodFormularza': (w) => w.naglowek.kodFormularza,
  'Naglowek.KodFormularza.@kodSystemowy': (w) => w.naglowek.kodSystemowy,
  'Naglowek.KodFormularza.@wersjaSchemy': (w) => w.naglowek.wersjaSchemy,
  'Naglowek.WariantFormularza': (w) => w.naglowek.wariant,
  'Naglowek.DataWytworzeniaFa': (w) => w.naglowek.dataWytworzenia,
  'Naglowek.SystemInfo': (w) => w.naglowek.systemInfo,
  'Podmiot1.DaneIdentyfikacyjne.NIP': (w) => w.sprzedawca.nip,
  'Podmiot1.DaneIdentyfikacyjne.Nazwa': (w) => w.sprzedawca.nazwa,
  'Podmiot1.Adres.KodKraju': (w) => w.sprzedawca.kodKraju,
  'Podmiot1.Adres.AdresL1': (w) => w.sprzedawca.adresL1,
  'Podmiot1.DaneKontaktowe.Email': (w) => w.sprzedawca.email,
  'Podmiot2.DaneIdentyfikacyjne.NIP': (w) => w.nabywca.nip,
  'Podmiot2.DaneIdentyfikacyjne.BrakID': (w) => tak(w.nabywca.brakId),
  'Podmiot2.DaneIdentyfikacyjne.Nazwa': (w) => w.nabywca.nazwa,
  'Podmiot2.Adres.KodKraju': (w) => w.nabywca.kodKraju,
  'Podmiot2.Adres.AdresL1': (w) => w.nabywca.adresL1,
  'Podmiot2.JST': (w) => w.nabywca.jst,
  'Podmiot2.GV': (w) => w.nabywca.gv,
  'Fa.KodWaluty': (w) => w.waluta,
  'Fa.P_1': (w) => w.dataWystawienia,
  'Fa.P_2': (w) => w.numer,
  'Fa.P_6': (w) => w.dataSprzedazy,
  'Fa.P_13_1': suma('1', 'netto'),
  'Fa.P_14_1': suma('1', 'vat'),
  'Fa.P_13_2': suma('2', 'netto'),
  'Fa.P_14_2': suma('2', 'vat'),
  'Fa.P_13_3': suma('3', 'netto'),
  'Fa.P_14_3': suma('3', 'vat'),
  'Fa.P_15': (w) => w.razem,
  'Fa.Adnotacje.P_16': adn('P_16'),
  'Fa.Adnotacje.P_17': adn('P_17'),
  'Fa.Adnotacje.P_18': adn('P_18'),
  'Fa.Adnotacje.P_18A': adn('P_18A'),
  'Fa.Adnotacje.Zwolnienie.P_19N': adn('P_19N'),
  'Fa.Adnotacje.NoweSrodkiTransportu.P_22N': adn('P_22N'),
  'Fa.Adnotacje.P_23': adn('P_23'),
  'Fa.Adnotacje.PMarzy.P_PMarzyN': adn('P_PMarzyN'),
  'Fa.RodzajFaktury': (w) => w.rodzaj,
  'Fa.PrzyczynaKorekty': (w) => w.korekta?.przyczyna,
  'Fa.TypKorekty': (w) => w.korekta?.typ,
  'Fa.DaneFaKorygowanej.DataWystFaKorygowanej': (w, [i]) => w.korekta?.faktury[i].data,
  'Fa.DaneFaKorygowanej.NrFaKorygowanej': (w, [i]) => w.korekta?.faktury[i].numer,
  'Fa.DaneFaKorygowanej.NrKSeF': (w, [i]) => tak(!!w.korekta?.faktury[i].numerKsef),
  'Fa.DaneFaKorygowanej.NrKSeFFaKorygowanej': (w, [i]) => w.korekta?.faktury[i].numerKsef,
  'Fa.DaneFaKorygowanej.NrKSeFN': (w, [i]) => tak(w.korekta?.faktury[i].pozaKsef),
  'Fa.FaWiersz.NrWierszaFa': (w, [i]) => w.wiersze[i].nr,
  'Fa.FaWiersz.P_7': (w, [i]) => w.wiersze[i].nazwa,
  'Fa.FaWiersz.P_8A': (w, [i]) => w.wiersze[i].jednostka,
  'Fa.FaWiersz.P_8B': (w, [i]) => w.wiersze[i].ilosc,
  'Fa.FaWiersz.P_9A': (w, [i]) => w.wiersze[i].cenaNetto,
  'Fa.FaWiersz.P_11': (w, [i]) => w.wiersze[i].wartoscNetto,
  'Fa.FaWiersz.P_12': (w, [i]) => w.wiersze[i].stawka,
  'Fa.FaWiersz.StanPrzed': (w, [i]) => tak(w.wiersze[i].stanPrzed),
  'Fa.Platnosc.Zaplacono': (w) => tak(w.platnosc?.zaplacono),
  'Fa.Platnosc.DataZaplaty': (w) => w.platnosc?.dataZaplaty,
  'Fa.Platnosc.FormaPlatnosci': (w) => w.platnosc?.formaKod,
  'Fa.Platnosc.PlatnoscInna': (w) => tak(!!w.platnosc?.formaOpis),
  'Fa.Platnosc.OpisPlatnosci': (w) => w.platnosc?.formaOpis,
};

/**
 * Wartości modelu, które MUSZĄ być wydrukowane — razem z etykietą albo w kolejności komórek
 * (sama wartość mogłaby się „znaleźć” w innym miejscu PDF-u, np. data sprzedaży w dacie zapłaty).
 */
function doWydruku(w: WizualizacjaFa3, meta: MetaKsef): string[] {
  const out: Array<string | null | undefined | false> = [
    `Faktura${w.rodzaj === 'KOR' ? ' korygująca' : ' VAT'} nr ${w.numer}`,
    `Data wystawienia: ${w.dataWystawienia}`,
    w.dataSprzedazy && `Data sprzedaży: ${w.dataSprzedazy}`,
    `Waluta: ${w.waluta}`,
    `${w.rodzaj === 'KOR' ? 'Korekta kwoty należności ogółem:' : 'Kwota należności ogółem:'} ${kwotaPl(w.razem)} ${w.waluta}`,
    `e-Faktura ${w.naglowek.kodSystemowy}, schemat ${w.naglowek.wersjaSchemy}`,
    `kod formularza ${w.naglowek.kodFormularza}`,
    `wariant ${w.naglowek.wariant}`,
    `wytworzono ${w.naglowek.dataWytworzenia}`,
    w.naglowek.systemInfo,
  ];
  for (const [tytul, p] of [['Sprzedawca', w.sprzedawca], ['Nabywca', w.nabywca]] as const) {
    out.push(`${tytul} ${p.nazwa}`);
    out.push(p.nip ? `NIP: ${p.nip}` : p.brakId ? 'Bez NIP (nabywca bez identyfikatora podatkowego)' : null);
    out.push([[p.adresL1, p.adresL2].filter(Boolean).join(', '), p.kodKraju].filter(Boolean).join(', '));
    out.push(p.email && `e-mail: ${p.email}`);
  }
  for (const s of w.sumy) {
    out.push(`${s.etykieta} ${kwotaPl(s.netto)} ${w.waluta}${s.vat ? ` ${kwotaPl(s.vat)} ${w.waluta}` : ''}`);
  }
  for (const r of w.wiersze) {
    out.push([r.nr, r.nazwa, r.jednostka, r.ilosc, r.cenaNetto && kwotaPl(r.cenaNetto), r.wartoscNetto && kwotaPl(r.wartoscNetto), stawkaPl(r.stawka)].filter(Boolean).join(' '));
  }
  if (w.wiersze.some((r) => r.stanPrzed)) {
    const przed = w.wiersze.find((r) => r.stanPrzed)!;
    const po = w.wiersze.find((r) => !r.stanPrzed);
    out.push(`Stan przed korektą ${przed.nr} ${przed.nazwa}`);
    if (po) out.push(`Stan po korekcie ${po.nr} ${po.nazwa}`);
  }
  for (const a of w.adnotacje) if (a.tekst) out.push(a.tekst);
  if (w.korekta) {
    out.push(w.korekta.przyczyna && `Przyczyna korekty: ${w.korekta.przyczyna}`);
    out.push(w.korekta.typ && `Typ korekty: ${w.korekta.typ} — ${w.korekta.typOpis}`);
    for (const k of w.korekta.faktury) {
      const ksef = k.numerKsef ? ` (numer KSeF: ${k.numerKsef})` : k.pozaKsef ? ' (wystawiona poza KSeF)' : '';
      out.push(`Koryguje fakturę nr ${k.numer} z dnia ${k.data}${ksef}`);
    }
  }
  if (w.platnosc) {
    if (w.platnosc.zaplacono) out.push(`Zapłacono${w.platnosc.dataZaplaty ? ` dnia ${w.platnosc.dataZaplaty}` : ''}`);
    out.push(w.platnosc.formaKod && `Forma płatności: ${FORMY_PLATNOSCI[w.platnosc.formaKod]}`);
    out.push(w.platnosc.formaOpis && `Forma płatności: ${w.platnosc.formaOpis}`);
  }
  out.push(meta.numerKsef ? `Numer KSeF: ${meta.numerKsef}` : 'OFFLINE', meta.linkWeryfikacji);
  return out.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

const bezSpacji = (s: string) => s.replace(/\s+/g, '');

function meta(xml: string, numerKsef: string | null): MetaKsef {
  const w = wizualizacjaFa3(xml);
  return {
    numerKsef,
    przyjetoWKsef: numerKsef ? new Date('2026-10-12T09:15:07Z') : null,
    linkWeryfikacji: linkWeryfikacjiKsef('test', w.sprzedawca.nip!, w.dataWystawienia, skrotFakturyBase64Url(xml)),
    srodowisko: 'test',
  };
}

describe('KSeF 12.10 — XML FA(3) → model wizualizacji: każde pole z tą samą wartością', () => {
  it.each(FAKTURY_TESTOWE)('%s', (_nazwa, faktura) => {
    const xml = xmlFaktury(faktura());
    const wiz = wizualizacjaFa3(xml);
    // Jedyny wyjątek: przestrzeń nazw dokumentu (atrybut techniczny, nie pole faktury).
    const pola = liscie(parsujFa3(xml)).filter((l) => l.sciezka !== '@xmlns');
    expect(pola.length).toBeGreaterThan(30);
    for (const pole of pola) {
      const odczyt = ODWZOROWANIE[pole.sciezka];
      expect(odczyt, `pole ${pole.sciezka} jest w XML, a model wizualizacji go nie odwzorowuje`).toBeDefined();
      expect(odczyt(wiz, pole.indeksy), `pole ${pole.sciezka}${JSON.stringify(pole.indeksy)}`).toBe(pole.wartosc);
    }
  });
});

describe('KSeF 12.10 — model wizualizacji → PDF: każda wartość jest wydrukowana', () => {
  it.each(FAKTURY_TESTOWE)('%s (z numerem KSeF i jako OFFLINE)', async (_nazwa, faktura) => {
    const xml = xmlFaktury(faktura());
    const wiz = wizualizacjaFa3(xml);
    for (const numer of ['9292069367-20261012-0100F1E2D3C4-5A', null]) {
      const m = meta(xml, numer);
      const { pdf, teksty } = await renderujFaktureKsefZTekstem(wiz, m);
      expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
      const wydruk = bezSpacji(teksty.join(' '));
      for (const v of doWydruku(wiz, m)) {
        expect(wydruk, `brak na PDF-ie: ${v}`).toContain(bezSpacji(v));
      }
    }
  });

  it('PDF nie pokazuje danych spoza XML-a (e-mail nabywcy jest w snapshocie, ale nie w FA(3))', async () => {
    const wejscie = fakturaB2B();
    const xml = xmlFaktury(wejscie);
    const { teksty } = await renderujFaktureKsefZTekstem(wizualizacjaFa3(xml), meta(xml, null));
    const email = (wejscie.invoice.buyerSnapshot as { email: string }).email;
    expect(xml).not.toContain(email);
    expect(teksty.join(' ')).not.toContain(email);
  });

  it('pod kodem QR: numer KSeF, gdy znany; „OFFLINE”, gdy nie (kody-qr.md)', async () => {
    const xml = xmlFaktury(fakturaB2C());
    const wiz = wizualizacjaFa3(xml);
    const z = await renderujFaktureKsefZTekstem(wiz, meta(xml, '9292069367-20261012-0100F1E2D3C4-5A'));
    expect(z.teksty).toContain('9292069367-20261012-0100F1E2D3C4-5A');
    expect(z.teksty).not.toContain('OFFLINE');
    const bez = await renderujFaktureKsefZTekstem(wiz, meta(xml, null));
    expect(bez.teksty).toContain('OFFLINE');
  });
});

describe('KSeF 12.10 — model wizualizacji: konkretne wartości', () => {
  it('B2B: NIP nabywcy, kwoty 1:1 z XML-a, forma płatności „karta”', () => {
    const wiz = wizualizacjaFa3(xmlFaktury(fakturaB2B()));
    expect(wiz.nabywca).toMatchObject({ nip: NIP_NABYWCY, brakId: false, jst: '2', gv: '2' });
    expect(wiz.sumy).toEqual([{ pole: '1', etykieta: 'stawka podstawowa (23% / 22%)', netto: '365.04', vat: '83.96' }]);
    expect(wiz.razem).toBe('449.00');
    expect(wiz.dataSprzedazy).toBe('2026-10-11');
    expect(wiz.platnosc).toMatchObject({ zaplacono: true, dataZaplaty: '2026-10-11', formaKod: '2' });
  });

  it('B2C: BrakID, bez NIP, płatność „inna” z opisem', () => {
    const wiz = wizualizacjaFa3(xmlFaktury(fakturaB2C()));
    expect(wiz.nabywca).toMatchObject({ nip: null, brakId: true, nazwa: 'Anna Nowak' });
    expect(wiz.platnosc?.formaOpis).toBe('Portfel Verris (środki przedpłacone)');
  });

  it('korekta: faktura korygowana z numerem KSeF, wiersze przed/po, różnica w sumach', () => {
    const wiz = wizualizacjaFa3(xmlFaktury(korekta()));
    expect(wiz.rodzaj).toBe('KOR');
    expect(wiz.korekta?.faktury).toEqual([
      { data: '2026-10-01', numer: 'VFV/2026/10/0001', numerKsef: '9292069367-20261001-0100A0B1C2D3-E4', pozaKsef: false },
    ]);
    expect(wiz.wiersze.map((w) => [w.wartoscNetto, w.stanPrzed])).toEqual([['365.04', true], ['182.52', false]]);
    expect(wiz.razem).toBe('-224.50');
    expect(wiz.platnosc).toBeNull();
  });

  it('kwoty po polsku bez zaokrąglania; stawka liczbowa z %', () => {
    expect(kwotaPl('1234567.50')).toBe('1 234 567,50');
    expect(kwotaPl('-224.50')).toBe('-224,50');
    expect(stawkaPl('23')).toBe('23%');
    expect(stawkaPl('np I')).toBe('np I');
  });
});

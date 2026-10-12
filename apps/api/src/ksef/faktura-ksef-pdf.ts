import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { osadzCzcionki } from '../common/pdf/czcionki.js';
import { zawin } from '../billing/invoice-pdf.service.js';
import { macierzQr, PODPIS_QR_BEZ_NUMERU, type SrodowiskoKsef } from './kod-qr-ksef.js';
import { FORMY_PLATNOSCI, type PodmiotWiz, type WierszWiz, type WizualizacjaFa3 } from './wizualizacja-fa3.js';

/**
 * PDF faktury z KSeF w designie Verris — wizualizacja zapisanego XML-a FA(3).
 *
 * Rysuje WYŁĄCZNIE dane z `WizualizacjaFa3` (model powstaje z XML-a wysłanego do KSeF)
 * i metadane KSeF (numer, data przyjęcia, link KOD I). Nie ma tu pól spoza XML-a —
 * dlatego w tabeli nie ma VAT-u ani brutto per wiersz: FA(3) z panelu ich nie niesie.
 *
 * Kod QR (KOD I) wg https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md:
 * pod kodem numer KSeF, a gdy numeru jeszcze nie ma — „OFFLINE”.
 */

export interface MetaKsef {
  numerKsef: string | null;
  przyjetoWKsef: Date | null;
  linkWeryfikacji: string;
  srodowisko: SrodowiskoKsef;
}

const GRANAT = rgb(0.07, 0.13, 0.34); // ten sam co nagłówek faktury w invoice-pdf.service.ts
const SZARY = rgb(0.4, 0.4, 0.4);
const SZARY_JASNY = rgb(0.45, 0.45, 0.45);
const RAMKA = rgb(0.7, 0.75, 0.85);
const TLO_NAGLOWKA = rgb(0.94, 0.96, 1);
const TLO_PASKA = rgb(0.98, 0.98, 0.98);
const CZERWONY = rgb(0.7, 0.1, 0.1);
const CZARNY = rgb(0, 0, 0);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const STOPKA = 48;

/** Kwota z XML-a („-1234.50”) w zapisie polskim („-1 234,50”) — bez zaokrąglania. */
export function kwotaPl(v: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return v;
  const calosc = m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${m[1]}${calosc}${m[3] !== undefined ? `,${m[3]}` : ''}`;
}

/** Stawka z P_12 do wydruku: liczba → „23%”, kody słowne („zw”, „np I”) bez zmian. */
export function stawkaPl(v: string | null): string {
  if (!v) return '';
  return /^\d+$/.test(v) ? `${v}%` : v;
}

const DATA_CZAS_PL = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function dataCzasPl(d: Date): string {
  return DATA_CZAS_PL.format(d);
}

const ETYKIETA_SRODOWISKA: Record<SrodowiskoKsef, string> = {
  test: 'TESTOWE (TE)',
  demo: 'PRZEDPRODUKCYJNE (DEMO)',
  prod: 'PRODUKCYJNE',
};

interface Pioro {
  font: PDFFont;
  size: number;
  color?: RGB;
}

class Rysownik {
  page: PDFPage;
  y = PAGE_H - MARGIN;
  readonly teksty: string[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly mono: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE_W, PAGE_H]);
  }

  tekst(t: string, x: number, y: number, p: Pioro): void {
    if (!t) return;
    this.teksty.push(t);
    this.page.drawText(t, { x, y, size: p.size, font: p.font, color: p.color ?? CZARNY });
  }

  wPrawo(t: string, prawaKrawedz: number, y: number, p: Pioro): void {
    this.tekst(t, prawaKrawedz - p.font.widthOfTextAtSize(t, p.size), y, p);
  }

  szer(t: string, p: Pioro): number {
    return p.font.widthOfTextAtSize(t, p.size);
  }

  /** Nowa strona, gdy do stopki zostało mniej niż `h`. */
  zapewnMiejsce(h: number): void {
    if (this.y - h >= MARGIN + STOPKA) return;
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  linia(y: number, grubosc = 0.7, kolor: RGB = SZARY): void {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: grubosc, color: kolor });
  }
}

/** Linie opisu podmiotu — wspólne dla pomiaru wysokości i rysowania. */
function liniePodmiotu(p: PodmiotWiz, sprzedawca: boolean): Array<{ t: string; b?: boolean }> {
  const l: Array<{ t: string; b?: boolean }> = [];
  if (p.nazwa) l.push({ t: p.nazwa, b: true });
  if (p.nip) l.push({ t: `NIP: ${p.nip}` });
  else if (p.brakId) l.push({ t: 'Bez NIP (nabywca bez identyfikatora podatkowego)' });
  const adres = [p.adresL1, p.adresL2].filter(Boolean).join(', ');
  if (adres || p.kodKraju) l.push({ t: [adres, p.kodKraju].filter(Boolean).join(', ') });
  if (p.email) l.push({ t: `e-mail: ${p.email}` });
  if (!sprzedawca) {
    if (p.jst === '1') l.push({ t: 'Faktura dotyczy jednostki podrzędnej JST' });
    if (p.gv === '1') l.push({ t: 'Faktura dotyczy członka grupy VAT' });
  }
  return l;
}

export async function renderujFaktureKsefZTekstem(
  wiz: WizualizacjaFa3,
  meta: MetaKsef,
): Promise<{ pdf: Uint8Array; teksty: string[] }> {
  const pdf = await PDFDocument.create();
  const korekta = wiz.rodzaj === 'KOR';
  pdf.setTitle(`${korekta ? 'Faktura korygująca' : 'Faktura'} ${wiz.numer}`);
  pdf.setAuthor(wiz.sprzedawca.nazwa ?? '');
  pdf.setSubject(`e-Faktura FA(3) z KSeF — ${wiz.numer}`);
  pdf.setCreator('Verris');
  pdf.setProducer('Verris Panel');

  const { regular, bold, mono } = await osadzCzcionki(pdf);
  const r = new Rysownik(pdf, regular, bold, mono);
  const P = (size: number, color?: RGB): Pioro => ({ font: regular, size, color });
  const B = (size: number, color?: RGB): Pioro => ({ font: bold, size, color });
  const prawa = PAGE_W - MARGIN;
  const szerokosc = PAGE_W - 2 * MARGIN;

  // --- Nagłówek: sprzedawca (granat) + tytuł z numerem (P_2) --------------------------
  const nazwaNaglowka = wiz.sprzedawca.nazwa ?? '';
  const nazwaLinie = zawin(nazwaNaglowka, bold, 14, szerokosc * 0.45).slice(0, 2);
  nazwaLinie.forEach((l, i) => r.tekst(l, MARGIN, r.y - 8 - i * 16, B(14, GRANAT)));
  const tytul = `${korekta ? 'Faktura korygująca' : 'Faktura VAT'}  nr  ${wiz.numer}`;
  let rozmiar = 16;
  while (rozmiar > 9 && r.szer(tytul, B(rozmiar)) > szerokosc * 0.52) rozmiar -= 0.5;
  r.wPrawo(tytul, prawa, r.y - 8, B(rozmiar));
  const ksefNaglowek = meta.numerKsef ? `Numer KSeF: ${meta.numerKsef}` : 'Numer KSeF: jeszcze nienadany';
  r.wPrawo(ksefNaglowek, prawa, r.y - 24, P(8.5, SZARY));
  r.y -= Math.max(30, 8 + nazwaLinie.length * 16) + 4;
  r.linia(r.y);
  r.y -= 16;

  // --- Daty (P_1, P_6) i waluta --------------------------------------------------------
  r.tekst(`Data wystawienia: ${wiz.dataWystawienia}`, MARGIN, r.y, P(9));
  if (wiz.dataSprzedazy) r.tekst(`Data sprzedaży: ${wiz.dataSprzedazy}`, MARGIN + 180, r.y, P(9));
  r.wPrawo(`Waluta: ${wiz.waluta}`, prawa, r.y, P(9));
  r.y -= 16;

  // --- Korekta: faktura korygowana, przyczyna, typ ----------------------------------------
  if (wiz.korekta) {
    for (const k of wiz.korekta.faktury) {
      const ksef = k.numerKsef ? ` (numer KSeF: ${k.numerKsef})` : k.pozaKsef ? ' (wystawiona poza KSeF)' : '';
      for (const l of zawin(`Koryguje fakturę nr ${k.numer} z dnia ${k.data}${ksef}`, bold, 9, szerokosc)) {
        r.tekst(l, MARGIN, r.y, B(9));
        r.y -= 12;
      }
    }
    if (wiz.korekta.przyczyna) {
      for (const l of zawin(`Przyczyna korekty: ${wiz.korekta.przyczyna}`, regular, 9, szerokosc)) {
        r.tekst(l, MARGIN, r.y, P(9));
        r.y -= 12;
      }
    }
    if (wiz.korekta.typ) {
      r.tekst(`Typ korekty: ${wiz.korekta.typ}${wiz.korekta.typOpis ? ` — ${wiz.korekta.typOpis}` : ''}`, MARGIN, r.y, P(9));
      r.y -= 12;
    }
    r.y -= 6;
  }

  // --- Sprzedawca (Podmiot1) i Nabywca (Podmiot2) ------------------------------------------
  const polowa = (szerokosc - 20) / 2;
  const przygotuj = (p: PodmiotWiz, sprzedawca: boolean) =>
    liniePodmiotu(p, sprzedawca).flatMap((l) =>
      zawin(l.t, l.b ? bold : regular, l.b ? 10 : 9, polowa - 16).map((t) => ({ t, b: l.b })),
    );
  const ls = przygotuj(wiz.sprzedawca, true);
  const ln = przygotuj(wiz.nabywca, false);
  const wysokoscRamki = 26 + Math.max(ls.length, ln.length) * 12 + 6;
  r.zapewnMiejsce(wysokoscRamki + 10);
  const ramka = (x: number, tytulRamki: string, linie: Array<{ t: string; b?: boolean }>) => {
    r.page.drawRectangle({ x, y: r.y - wysokoscRamki, width: polowa, height: wysokoscRamki, borderColor: RAMKA, borderWidth: 0.5, color: rgb(1, 1, 1) });
    r.tekst(tytulRamki, x + 8, r.y - 12, B(9, SZARY));
    linie.forEach((l, i) => r.tekst(l.t, x + 8, r.y - 26 - i * 12, l.b ? B(10) : P(9)));
  };
  ramka(MARGIN, 'Sprzedawca', ls);
  ramka(MARGIN + polowa + 20, 'Nabywca', ln);
  r.y -= wysokoscRamki + 18;

  // --- Pozycje (FaWiersz) --------------------------------------------------------------------
  const kolumny: Array<{ etykieta: string; w: number; prawo?: boolean }> = [
    { etykieta: 'Lp.', w: 26, prawo: true },
    { etykieta: 'Nazwa towaru / usługi', w: 187 },
    { etykieta: 'J.m.', w: 36 },
    { etykieta: 'Ilość', w: 44, prawo: true },
    { etykieta: 'Cena jedn. netto', w: 82, prawo: true },
    { etykieta: 'Wartość netto', w: 78, prawo: true },
    { etykieta: 'Stawka VAT', w: 62, prawo: true },
  ];
  const naglowekTabeli = () => {
    r.page.drawRectangle({ x: MARGIN, y: r.y - 22, width: szerokosc, height: 22, color: TLO_NAGLOWKA });
    let x = MARGIN;
    for (const k of kolumny) {
      if (k.prawo) r.wPrawo(k.etykieta, x + k.w - 4, r.y - 14, B(8));
      else r.tekst(k.etykieta, x + 4, r.y - 14, B(8));
      x += k.w;
    }
    r.y -= 22;
  };
  r.zapewnMiejsce(60);
  naglowekTabeli();

  const grupy: Array<{ podpis: string | null; wiersze: WierszWiz[] }> = korekta
    ? [
        { podpis: 'Stan przed korektą', wiersze: wiz.wiersze.filter((w) => w.stanPrzed) },
        { podpis: 'Stan po korekcie', wiersze: wiz.wiersze.filter((w) => !w.stanPrzed) },
      ].filter((g) => g.wiersze.length > 0)
    : [{ podpis: null, wiersze: wiz.wiersze }];
  let pasek = 0;
  for (const g of grupy) {
    if (g.podpis) {
      r.zapewnMiejsce(18);
      r.tekst(g.podpis, MARGIN + 4, r.y - 12, B(8.5, GRANAT));
      r.y -= 18;
    }
    for (const w of g.wiersze) {
      const nazwa = zawin(w.nazwa ?? '', regular, 9, kolumny[1].w - 8);
      const h = Math.max(18, nazwa.length * 11 + 7);
      if (r.y - h < MARGIN + STOPKA) {
        r.zapewnMiejsce(h + 22);
        naglowekTabeli();
      }
      pasek += 1;
      if (pasek % 2 === 0) r.page.drawRectangle({ x: MARGIN, y: r.y - h, width: szerokosc, height: h, color: TLO_PASKA });
      const komorki = [w.nr, '', w.jednostka ?? '', w.ilosc ?? '', w.cenaNetto ? kwotaPl(w.cenaNetto) : '', w.wartoscNetto ? kwotaPl(w.wartoscNetto) : '', stawkaPl(w.stawka)];
      let x = MARGIN;
      kolumny.forEach((k, i) => {
        if (i === 1) nazwa.forEach((l, n) => r.tekst(l, x + 4, r.y - 12 - n * 11, P(9)));
        else if (k.prawo) r.wPrawo(komorki[i], x + k.w - 4, r.y - 12, P(9));
        else r.tekst(komorki[i], x + 4, r.y - 12, P(9));
        x += k.w;
      });
      r.y -= h;
    }
  }
  r.y -= 6;
  r.linia(r.y, 0.7, rgb(0.6, 0.6, 0.6));
  r.y -= 18;

  // --- Podsumowanie wg stawek (P_13_x / P_14_x) i P_15 --------------------------------------
  r.zapewnMiejsce(44 + wiz.sumy.length * 15 + 30);
  const xSum = prawa - 340;
  r.tekst('Podsumowanie według stawek VAT', xSum, r.y, B(9, SZARY));
  r.y -= 14;
  r.tekst('Stawka', xSum, r.y, B(8, SZARY));
  r.wPrawo('Wartość netto', prawa - 105, r.y, B(8, SZARY));
  r.wPrawo('Kwota VAT', prawa, r.y, B(8, SZARY));
  r.y -= 14;
  for (const s of wiz.sumy) {
    r.tekst(s.etykieta, xSum, r.y, P(9));
    r.wPrawo(`${kwotaPl(s.netto)} ${wiz.waluta}`, prawa - 105, r.y, P(9));
    if (s.vat != null) r.wPrawo(`${kwotaPl(s.vat)} ${wiz.waluta}`, prawa, r.y, P(9));
    r.y -= 15;
  }
  r.y -= 6;
  const etykietaRazem = korekta ? 'Korekta kwoty należności ogółem:' : 'Kwota należności ogółem:';
  const razem = `${kwotaPl(wiz.razem)} ${wiz.waluta}`;
  r.wPrawo(etykietaRazem, prawa - r.szer(razem, B(12)) - 10, r.y, B(10));
  r.wPrawo(razem, prawa, r.y, B(12, GRANAT));
  r.y -= 24;

  // --- Adnotacje (tylko te, które drukuje się na fakturze: wartość „1”) ----------------------
  for (const a of wiz.adnotacje) {
    if (!a.tekst) continue;
    r.zapewnMiejsce(14);
    r.tekst(a.tekst, MARGIN, r.y, B(9));
    r.y -= 13;
  }

  // --- Płatność ---------------------------------------------------------------------------
  if (wiz.platnosc) {
    const pl = wiz.platnosc;
    const linie: string[] = [];
    if (pl.zaplacono) linie.push(`Zapłacono${pl.dataZaplaty ? ` dnia ${pl.dataZaplaty}` : ''}`);
    if (pl.formaKod) linie.push(`Forma płatności: ${FORMY_PLATNOSCI[pl.formaKod] ?? pl.formaKod}`);
    if (pl.formaOpis) linie.push(`Forma płatności: ${pl.formaOpis}`);
    for (const t of pl.terminy) linie.push(`Termin płatności: ${t}`);
    for (const nr of pl.rachunki) linie.push(`Numer rachunku: ${nr}`);
    r.zapewnMiejsce(linie.length * 13 + 6);
    r.y -= 4;
    for (const l of linie) {
      r.tekst(l, MARGIN, r.y, l.startsWith('Zapłacono') ? B(9, rgb(0.05, 0.45, 0.2)) : P(9));
      r.y -= 13;
    }
  }

  // --- KSeF: KOD I + numer / OFFLINE -------------------------------------------------------
  const BOK_QR = 96;
  r.zapewnMiejsce(BOK_QR + 40);
  r.y -= 12;
  const gora = r.y;
  r.page.drawRectangle({ x: MARGIN, y: gora - BOK_QR - 30, width: szerokosc, height: BOK_QR + 30, borderColor: RAMKA, borderWidth: 0.5 });
  const qr = macierzQr(meta.linkWeryfikacji);
  const modul = BOK_QR / (qr.rozmiar + 8); // 4 moduły strefy ciszy z każdej strony (ISO/IEC 18004)
  const xQr = MARGIN + 10;
  const yQr = gora - 8 - BOK_QR;
  r.page.drawRectangle({ x: xQr, y: yQr, width: BOK_QR, height: BOK_QR, color: rgb(1, 1, 1) });
  for (let w = 0; w < qr.rozmiar; w++) {
    for (let k = 0; k < qr.rozmiar; k++) {
      if (!qr.ciemny(w, k)) continue;
      r.page.drawRectangle({
        x: xQr + (k + 4) * modul,
        y: yQr + BOK_QR - (w + 5) * modul,
        width: modul,
        height: modul,
        color: CZARNY,
      });
    }
  }
  const podpis = meta.numerKsef ?? PODPIS_QR_BEZ_NUMERU;
  const pioroPodpisu: Pioro = { font: mono, size: meta.numerKsef ? 5.6 : 9, color: CZARNY };
  r.tekst(podpis, xQr + BOK_QR / 2 - r.szer(podpis, pioroPodpisu) / 2, yQr - 10, pioroPodpisu);

  const xOpis = xQr + BOK_QR + 30;
  const szerOpisu = prawa - 10 - xOpis;
  let yOpis = gora - 16;
  r.tekst('Weryfikacja faktury w KSeF', xOpis, yOpis, B(10, GRANAT));
  yOpis -= 14;
  r.tekst(meta.numerKsef ? `Numer KSeF: ${meta.numerKsef}` : 'Numer KSeF: jeszcze nienadany (OFFLINE)', xOpis, yOpis, P(9));
  yOpis -= 12;
  if (meta.przyjetoWKsef) {
    r.tekst(`Data przyjęcia w KSeF: ${dataCzasPl(meta.przyjetoWKsef)}`, xOpis, yOpis, P(9));
    yOpis -= 12;
  }
  for (const l of zawin('Zeskanuj kod QR albo otwórz link, aby sprawdzić fakturę w Krajowym Systemie e-Faktur:', regular, 8, szerOpisu)) {
    r.tekst(l, xOpis, yOpis, P(8, SZARY));
    yOpis -= 10;
  }
  for (const l of zawin(meta.linkWeryfikacji.replace(/\//g, '/ '), mono, 7, szerOpisu)) {
    r.tekst(l.replace(/\/ /g, '/'), xOpis, yOpis, { font: mono, size: 7, color: GRANAT });
    yOpis -= 9;
  }
  if (meta.srodowisko !== 'prod') {
    yOpis -= 2;
    r.tekst(`Środowisko KSeF: ${ETYKIETA_SRODOWISKA[meta.srodowisko]} — dokument bez skutków podatkowych.`, xOpis, yOpis, B(8, CZERWONY));
  }
  r.y = gora - BOK_QR - 30 - 10;

  // --- Stopka na każdej stronie ---------------------------------------------------------------
  const strony = pdf.getPages();
  const n = wiz.naglowek;
  const techniczne = [
    n.kodSystemowy ? `e-Faktura ${n.kodSystemowy}${n.wersjaSchemy ? `, schemat ${n.wersjaSchemy}` : ''}` : null,
    n.kodFormularza ? `kod formularza ${n.kodFormularza}` : null,
    n.wariant ? `wariant ${n.wariant}` : null,
    n.dataWytworzenia ? `wytworzono ${n.dataWytworzenia}` : null,
    n.systemInfo,
  ].filter(Boolean).join(' · ');
  strony.forEach((s, i) => {
    r.page = s;
    r.page.drawLine({ start: { x: MARGIN, y: MARGIN + 22 }, end: { x: prawa, y: MARGIN + 22 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    r.tekst('Wizualizacja e-faktury FA(3) przesłanej do KSeF — treść zgodna z plikiem XML. Verris', MARGIN, MARGIN + 10, P(7.5, SZARY_JASNY));
    r.tekst(techniczne, MARGIN, MARGIN - 1, P(6.5, SZARY_JASNY));
    r.wPrawo(`Strona ${i + 1} z ${strony.length}`, prawa, MARGIN + 10, P(7.5, SZARY_JASNY));
  });

  return { pdf: await pdf.save(), teksty: r.teksty };
}

export async function renderujFaktureKsef(wiz: WizualizacjaFa3, meta: MetaKsef): Promise<Uint8Array> {
  return (await renderujFaktureKsefZTekstem(wiz, meta)).pdf;
}

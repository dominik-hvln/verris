import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { KOLORY_MARKI, osadzCzcionkiMarki, rysujLockup, szerokoscLockupu, type CzcionkiMarki } from '../common/pdf/marka.js';
import { zawin } from '../billing/invoice-pdf.service.js';
import { macierzQr, PODPIS_QR_BEZ_NUMERU, type SrodowiskoKsef } from './kod-qr-ksef.js';
import { FORMY_PLATNOSCI, type PodmiotWiz, type WierszWiz, type WizualizacjaFa3 } from './wizualizacja-fa3.js';

/**
 * PDF faktury z KSeF w designie Verris — wizualizacja zapisanego XML-a FA(3).
 * Marka wg branding/ (common/pdf/marka.ts): pas Pine z lockupem, Mint jako jedyny akcent,
 * Hanken Grotesk w tekście, JetBrains Mono w liczbach.
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

const K = KOLORY_MARKI;
const CZERWONY = rgb(0.7, 0.1, 0.1);

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

/** Wysokość pasa marki na pierwszej stronie i na kolejnych. */
const PAS_PIERWSZA = 84;
const PAS_KOLEJNA = 34;

class Rysownik {
  page: PDFPage;
  y = PAGE_H - MARGIN;
  readonly teksty: string[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    readonly cz: CzcionkiMarki,
    private readonly pasKolejnejStrony: (r: Rysownik) => void,
  ) {
    this.page = pdf.addPage([PAGE_W, PAGE_H]);
  }

  /** Krój marki, a gdy tekst ma znak spoza jej podzbioru — DejaVu (patrz CzcionkiMarki.zapasowa). */
  private font(t: string, p: Pioro): PDFFont {
    return this.cz.zapasowa(p.font, t);
  }

  tekst(t: string, x: number, y: number, p: Pioro): void {
    if (!t) return;
    this.teksty.push(t);
    this.page.drawText(t, { x, y, size: p.size, font: this.font(t, p), color: p.color ?? K.pine });
  }

  wPrawo(t: string, prawaKrawedz: number, y: number, p: Pioro): void {
    this.tekst(t, prawaKrawedz - this.szer(t, p), y, p);
  }

  szer(t: string, p: Pioro): number {
    return this.font(t, p).widthOfTextAtSize(t, p.size);
  }

  /** Nowa strona, gdy do stopki zostało mniej niż `h`. */
  zapewnMiejsce(h: number): void {
    if (this.y - h >= MARGIN + STOPKA) return;
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pasKolejnejStrony(this);
  }

  linia(y: number, grubosc = 0.6, kolor: RGB = K.linia): void {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: grubosc, color: kolor });
  }

  prostokat(x: number, y: number, w: number, h: number, kolor: RGB): void {
    this.page.drawRectangle({ x, y, width: w, height: h, color: kolor });
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

  const cz = await osadzCzcionkiMarki(pdf, JSON.stringify(wiz) + JSON.stringify(meta));
  const T = (size: number, color?: RGB): Pioro => ({ font: cz.tekst, size, color });
  const B = (size: number, color?: RGB): Pioro => ({ font: cz.tekstMocny, size, color });
  const L = (size: number, color?: RGB): Pioro => ({ font: cz.liczby, size, color });
  const LB = (size: number, color?: RGB): Pioro => ({ font: cz.liczbyMocne, size, color });
  const prawa = PAGE_W - MARGIN;
  const szerokosc = PAGE_W - 2 * MARGIN;
  const rodzajTytul = korekta ? 'Faktura korygująca' : 'Faktura VAT';

  // Kolejne strony: wąski pas Pine z lockupem i numerem faktury.
  const pasKolejnej = (r: Rysownik) => {
    r.prostokat(0, PAGE_H - PAS_KOLEJNA, PAGE_W, PAS_KOLEJNA, K.pine);
    r.prostokat(0, PAGE_H - PAS_KOLEJNA - 1.5, PAGE_W, 1.5, K.mint);
    rysujLockup(r.page, MARGIN, PAGE_H - PAS_KOLEJNA / 2 - 6, 12, { kolor: K.paper, tlo: K.pine });
    const t = `${rodzajTytul} nr ${wiz.numer} (cd.)`;
    r.page.drawText(t, { x: prawa - cz.tekstMocny.widthOfTextAtSize(t, 8.5), y: PAGE_H - PAS_KOLEJNA / 2 - 3, size: 8.5, font: cz.zapasowa(cz.tekstMocny, t), color: K.paper });
    r.y = PAGE_H - PAS_KOLEJNA - 22;
  };
  const r = new Rysownik(pdf, cz, pasKolejnej);

  // --- Pas marki: lockup Verris + rodzaj i numer faktury (P_2) + numer KSeF ---------------------
  r.prostokat(0, PAGE_H - PAS_PIERWSZA, PAGE_W, PAS_PIERWSZA, K.pine);
  r.prostokat(0, PAGE_H - PAS_PIERWSZA - 2, PAGE_W, 2, K.mint);
  rysujLockup(r.page, MARGIN, PAGE_H - PAS_PIERWSZA / 2 - 12, 24, { kolor: K.paper, tlo: K.pine });
  r.wPrawo(`${rodzajTytul} nr`, prawa, PAGE_H - 28, B(9, K.mint));
  let rozmiar = 17;
  while (rozmiar > 9 && r.szer(wiz.numer, B(rozmiar)) > szerokosc * 0.55) rozmiar -= 0.5;
  r.wPrawo(wiz.numer, prawa, PAGE_H - 28 - rozmiar - 3, B(rozmiar, K.paper));
  const ksefNaglowek = meta.numerKsef ? `Numer KSeF: ${meta.numerKsef}` : 'Numer KSeF: jeszcze nienadany';
  r.wPrawo(ksefNaglowek, prawa, PAGE_H - PAS_PIERWSZA + 12, T(8, K.stone));
  r.y = PAGE_H - PAS_PIERWSZA - 26;

  // --- Daty (P_1, P_6) i waluta --------------------------------------------------------------
  const daneNaglowka: Array<[string, string | null]> = [
    ['Data wystawienia:', wiz.dataWystawienia],
    ['Data sprzedaży:', wiz.dataSprzedazy],
    ['Waluta:', wiz.waluta],
  ];
  let xDanych = MARGIN;
  for (const [etykieta, wartosc] of daneNaglowka) {
    if (!wartosc) continue;
    r.tekst(etykieta, xDanych, r.y, T(8.5, K.stoneDruk));
    const xw = xDanych + r.szer(etykieta, T(8.5)) + 4;
    r.tekst(wartosc, xw, r.y, LB(9));
    xDanych = xw + r.szer(wartosc, LB(9)) + 28;
  }
  r.y -= 20;

  // --- Korekta: faktura korygowana, przyczyna, typ ----------------------------------------------
  if (wiz.korekta) {
    for (const k of wiz.korekta.faktury) {
      const ksef = k.numerKsef ? ` (numer KSeF: ${k.numerKsef})` : k.pozaKsef ? ' (wystawiona poza KSeF)' : '';
      for (const l of zawin(`Koryguje fakturę nr ${k.numer} z dnia ${k.data}${ksef}`, cz.tekstMocny, 9, szerokosc)) {
        r.tekst(l, MARGIN, r.y, B(9, K.green));
        r.y -= 12;
      }
    }
    if (wiz.korekta.przyczyna) {
      for (const l of zawin(`Przyczyna korekty: ${wiz.korekta.przyczyna}`, cz.tekst, 9, szerokosc)) {
        r.tekst(l, MARGIN, r.y, T(9));
        r.y -= 12;
      }
    }
    if (wiz.korekta.typ) {
      r.tekst(`Typ korekty: ${wiz.korekta.typ}${wiz.korekta.typOpis ? ` — ${wiz.korekta.typOpis}` : ''}`, MARGIN, r.y, T(9));
      r.y -= 12;
    }
    r.y -= 8;
  }

  // --- Sprzedawca (Podmiot1) i Nabywca (Podmiot2) ------------------------------------------------
  const polowa = (szerokosc - 16) / 2;
  const przygotuj = (p: PodmiotWiz, sprzedawca: boolean) =>
    liniePodmiotu(p, sprzedawca).flatMap((l) =>
      zawin(l.t, l.b ? cz.tekstMocny : cz.tekst, l.b ? 10 : 9, polowa - 24).map((t) => ({ t, b: l.b })),
    );
  const ls = przygotuj(wiz.sprzedawca, true);
  const ln = przygotuj(wiz.nabywca, false);
  const wysokoscRamki = 30 + Math.max(ls.length, ln.length) * 12.5 + 8;
  r.zapewnMiejsce(wysokoscRamki + 10);
  const ramka = (x: number, tytulRamki: string, linie: Array<{ t: string; b?: boolean }>) => {
    r.prostokat(x, r.y - wysokoscRamki, polowa, wysokoscRamki, K.paper);
    r.prostokat(x, r.y - wysokoscRamki, 2.5, wysokoscRamki, K.green);
    r.tekst(tytulRamki, x + 12, r.y - 15, B(8, K.green));
    linie.forEach((l, i) => r.tekst(l.t, x + 12, r.y - 31 - i * 12.5, l.b ? B(10) : T(9)));
  };
  ramka(MARGIN, 'Sprzedawca', ls);
  ramka(MARGIN + polowa + 16, 'Nabywca', ln);
  r.y -= wysokoscRamki + 20;

  // --- Pozycje (FaWiersz) ------------------------------------------------------------------------
  const kolumny: Array<{ etykieta: string; w: number; prawo?: boolean }> = [
    { etykieta: 'Lp.', w: 26, prawo: true },
    { etykieta: 'Nazwa towaru / usługi', w: 181 },
    { etykieta: 'J.m.', w: 36 },
    { etykieta: 'Ilość', w: 44, prawo: true },
    { etykieta: 'Cena jedn. netto', w: 84, prawo: true },
    { etykieta: 'Wartość netto', w: 82, prawo: true },
    { etykieta: 'Stawka VAT', w: 62, prawo: true },
  ];
  const naglowekTabeli = () => {
    r.prostokat(MARGIN, r.y - 22, szerokosc, 22, K.pine);
    let x = MARGIN;
    for (const k of kolumny) {
      if (k.prawo) r.wPrawo(k.etykieta, x + k.w - 6, r.y - 14, B(7.5, K.paper));
      else r.tekst(k.etykieta, x + 6, r.y - 14, B(7.5, K.paper));
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
      r.zapewnMiejsce(20);
      r.tekst(g.podpis, MARGIN + 6, r.y - 13, B(8.5, K.green));
      r.y -= 20;
    }
    for (const w of g.wiersze) {
      const nazwa = zawin(w.nazwa ?? '', cz.tekst, 9, kolumny[1].w - 12);
      const h = Math.max(20, nazwa.length * 11 + 9);
      if (r.y - h < MARGIN + STOPKA) {
        r.zapewnMiejsce(h + 22);
        naglowekTabeli();
      }
      pasek += 1;
      if (pasek % 2 === 0) r.prostokat(MARGIN, r.y - h, szerokosc, h, K.pasek);
      const komorki = [w.nr, '', w.jednostka ?? '', w.ilosc ?? '', w.cenaNetto ? kwotaPl(w.cenaNetto) : '', w.wartoscNetto ? kwotaPl(w.wartoscNetto) : '', stawkaPl(w.stawka)];
      let x = MARGIN;
      kolumny.forEach((k, i) => {
        if (i === 1) nazwa.forEach((l, n) => r.tekst(l, x + 6, r.y - 13 - n * 11, T(9)));
        else if (i === 2) r.tekst(komorki[i], x + 6, r.y - 13, T(9));
        else if (k.prawo) r.wPrawo(komorki[i], x + k.w - 6, r.y - 13, L(8.5));
        else r.tekst(komorki[i], x + 6, r.y - 13, L(8.5));
        x += k.w;
      });
      r.y -= h;
      r.linia(r.y, 0.4);
    }
  }
  r.y -= 22;

  // --- Podsumowanie wg stawek (P_13_x / P_14_x) i P_15 --------------------------------------------
  r.zapewnMiejsce(44 + wiz.sumy.length * 15 + 50);
  const xSum = prawa - 330;
  r.tekst('Podsumowanie według stawek VAT', xSum, r.y, B(8.5, K.green));
  r.y -= 15;
  r.tekst('Stawka', xSum, r.y, T(7.5, K.stoneDruk));
  r.wPrawo('Wartość netto', prawa - 110, r.y, T(7.5, K.stoneDruk));
  r.wPrawo('Kwota VAT', prawa, r.y, T(7.5, K.stoneDruk));
  r.y -= 5;
  r.page.drawLine({ start: { x: xSum, y: r.y }, end: { x: prawa, y: r.y }, thickness: 0.4, color: K.linia });
  r.y -= 12;
  // Etykieta stawki zawijana przed najszerszą kwotą netto, żeby na nią nie nachodziła.
  const najszerszaNetto = Math.max(0, ...wiz.sumy.map((s) => r.szer(`${kwotaPl(s.netto)} ${wiz.waluta}`, L(8.5))));
  const szerEtykietyStawki = prawa - 110 - najszerszaNetto - 10 - xSum;
  for (const s of wiz.sumy) {
    const linieEtykiety = zawin(s.etykieta, cz.tekst, 9, szerEtykietyStawki);
    r.zapewnMiejsce(linieEtykiety.length * 11 + 4);
    r.tekst(linieEtykiety[0] ?? '', xSum, r.y, T(9));
    r.wPrawo(`${kwotaPl(s.netto)} ${wiz.waluta}`, prawa - 110, r.y, L(8.5));
    if (s.vat != null) r.wPrawo(`${kwotaPl(s.vat)} ${wiz.waluta}`, prawa, r.y, L(8.5));
    for (const l of linieEtykiety.slice(1)) {
      r.y -= 11;
      r.tekst(l, xSum, r.y, T(9));
    }
    r.y -= 15;
  }
  r.y -= 4;
  const etykietaRazem = korekta ? 'Korekta kwoty należności ogółem:' : 'Kwota należności ogółem:';
  const razem = `${kwotaPl(wiz.razem)} ${wiz.waluta}`;
  const WYS_RAZEM = 34;
  r.prostokat(xSum - 12, r.y - WYS_RAZEM + 10, prawa - xSum + 12, WYS_RAZEM, K.pine);
  const yRazem = r.y - WYS_RAZEM / 2 + 5;
  r.tekst(etykietaRazem, xSum, yRazem, B(9.5, K.paper));
  r.wPrawo(razem, prawa - 10, yRazem - 1, LB(14, K.mint));
  r.y -= WYS_RAZEM + 14;

  // --- Adnotacje (tylko te, które drukuje się na fakturze: wartość „1”) ---------------------------
  for (const a of wiz.adnotacje) {
    if (!a.tekst) continue;
    r.zapewnMiejsce(14);
    r.tekst(a.tekst, MARGIN, r.y, B(9));
    r.y -= 13;
  }

  // --- Płatność --------------------------------------------------------------------------------
  if (wiz.platnosc) {
    const pl = wiz.platnosc;
    const linie: string[] = [];
    if (pl.zaplacono) linie.push(`Zapłacono${pl.dataZaplaty ? ` dnia ${pl.dataZaplaty}` : ''}`);
    if (pl.formaKod) linie.push(`Forma płatności: ${FORMY_PLATNOSCI[pl.formaKod] ?? pl.formaKod}`);
    if (pl.formaOpis) linie.push(`Forma płatności: ${pl.formaOpis}`);
    for (const t of pl.terminy) linie.push(`Termin płatności: ${t}`);
    for (const nr of pl.rachunki) linie.push(`Numer rachunku: ${nr}`);
    r.zapewnMiejsce(linie.length * 13 + 6);
    r.y -= 2;
    for (const l of linie) {
      r.tekst(l, MARGIN, r.y, l.startsWith('Zapłacono') ? B(9.5, K.green) : T(9));
      r.y -= 13;
    }
  }

  // --- KSeF: KOD I + numer / OFFLINE --------------------------------------------------------------
  const BOK_QR = 96;
  const WYS_PANELU = BOK_QR + 34;
  r.zapewnMiejsce(WYS_PANELU + 16);
  r.y -= 12;
  const gora = r.y;
  r.prostokat(MARGIN, gora - WYS_PANELU, szerokosc, WYS_PANELU, K.paper);
  const qr = macierzQr(meta.linkWeryfikacji);
  const modul = BOK_QR / (qr.rozmiar + 8); // 4 moduły strefy ciszy z każdej strony (ISO/IEC 18004)
  const xQr = MARGIN + 12;
  const yQr = gora - 10 - BOK_QR;
  r.prostokat(xQr, yQr, BOK_QR, BOK_QR, K.bialy);
  for (let w = 0; w < qr.rozmiar; w++) {
    for (let k = 0; k < qr.rozmiar; k++) {
      if (!qr.ciemny(w, k)) continue;
      // Moduły czarne na białym — kontrast wymagany przez czytniki (nie kolor marki).
      r.prostokat(xQr + (k + 4) * modul, yQr + BOK_QR - (w + 5) * modul, modul, modul, rgb(0, 0, 0));
    }
  }
  const podpis = meta.numerKsef ?? PODPIS_QR_BEZ_NUMERU;
  const pioroPodpisu: Pioro = { font: cz.liczby, size: meta.numerKsef ? 5.4 : 9, color: rgb(0, 0, 0) };
  r.tekst(podpis, xQr + BOK_QR / 2 - r.szer(podpis, pioroPodpisu) / 2, yQr - 11, pioroPodpisu);

  const xOpis = xQr + BOK_QR + 28;
  const szerOpisu = prawa - 12 - xOpis;
  let yOpis = gora - 20;
  r.tekst('Weryfikacja faktury w KSeF', xOpis, yOpis, B(10.5, K.green));
  yOpis -= 16;
  if (meta.numerKsef) {
    r.tekst('Numer KSeF:', xOpis, yOpis, T(9));
    r.tekst(meta.numerKsef, xOpis + r.szer('Numer KSeF:', T(9)) + 4, yOpis, L(8.5));
  } else {
    r.tekst('Numer KSeF: jeszcze nienadany (OFFLINE)', xOpis, yOpis, T(9));
  }
  yOpis -= 13;
  if (meta.przyjetoWKsef) {
    r.tekst('Data przyjęcia w KSeF:', xOpis, yOpis, T(9));
    r.tekst(dataCzasPl(meta.przyjetoWKsef), xOpis + r.szer('Data przyjęcia w KSeF:', T(9)) + 4, yOpis, L(8.5));
    yOpis -= 13;
  }
  yOpis -= 2;
  for (const l of zawin('Zeskanuj kod QR albo otwórz link, aby sprawdzić fakturę w Krajowym Systemie e-Faktur:', cz.tekst, 8, szerOpisu)) {
    r.tekst(l, xOpis, yOpis, T(8, K.stoneDruk));
    yOpis -= 10;
  }
  for (const l of zawin(meta.linkWeryfikacji.replace(/\//g, '/ '), cz.liczby, 6.8, szerOpisu)) {
    r.tekst(l.replace(/\/ /g, '/'), xOpis, yOpis, L(6.8, K.green));
    yOpis -= 9;
  }
  if (meta.srodowisko !== 'prod') {
    yOpis -= 2;
    r.tekst(`Środowisko KSeF: ${ETYKIETA_SRODOWISKA[meta.srodowisko]} — dokument bez skutków podatkowych.`, xOpis, yOpis, B(8, CZERWONY));
  }
  r.y = gora - WYS_PANELU - 10;

  // --- Stopka na każdej stronie: opis, dane techniczne XML, lockup, numer strony -----------------
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
    r.page.drawLine({ start: { x: MARGIN, y: MARGIN + 22 }, end: { x: prawa, y: MARGIN + 22 }, thickness: 0.5, color: K.linia });
    r.tekst('Wizualizacja e-faktury FA(3) przesłanej do KSeF — treść zgodna z plikiem XML.', MARGIN, MARGIN + 10, T(7.5, K.stoneDruk));
    r.tekst(techniczne, MARGIN, MARGIN - 1, T(6.5, K.stoneDruk));
    rysujLockup(r.page, prawa - szerokoscLockupu(9), MARGIN + 8, 9, { kolor: K.pine, tlo: K.bialy, akcent: K.green });
    r.wPrawo(`Strona ${i + 1} z ${strony.length}`, prawa, MARGIN - 1, T(6.5, K.stoneDruk));
  });

  return { pdf: await pdf.save(), teksty: r.teksty };
}

export async function renderujFaktureKsef(wiz: WizualizacjaFa3, meta: MetaKsef): Promise<Uint8Array> {
  return (await renderujFaktureKsefZTekstem(wiz, meta)).pdf;
}

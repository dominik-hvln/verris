import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, rgb } from 'pdf-lib';
import { osadzCzcionki } from '../common/pdf/czcionki';
import { Prisma } from '@verris/database';

import { RODZAJ_DOKUMENT_ROZLICZENIOWY, RODZAJ_PROFORMA } from './tryb-fakturowania';

/** FAK-01 — adnotacja na dokumencie rozliczeniowym. */
export const ADNOTACJA_DOKUMENTU_ROZLICZENIOWEGO: readonly string[] = [
  'Dokument rozliczeniowy nie jest fakturą VAT.',
  'Faktura VAT za tę sprzedaż zostanie wystawiona odrębnie i udostępniona w panelu klienta.',
];

/** M-24 — adnotacja na proformie. */
export const ADNOTACJA_PROFORMY: readonly string[] = [
  'Faktura proforma nie jest fakturą VAT i nie stanowi podstawy do odliczenia podatku.',
  'Po opłaceniu odnowienia dokument sprzedaży udostępnimy w panelu klienta.',
];

/** Snapshot zapisywany w `Invoice.sellerSnapshot`. */
export interface SellerSnapshot {
  name: string;
  nip: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  bankAccount?: string;
  regon?: string;
  krs?: string;
}

/** Snapshot zapisywany w `Invoice.buyerSnapshot`. */
export interface BuyerSnapshot {
  /** Pełna nazwa (firma lub Imię Nazwisko). */
  name: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  email: string;
}

export interface InvoiceLineItem {
  name: string;
  /** Liczba jednostek (zwykle 1 dla subskrypcji). */
  quantity: number;
  /** Cena netto za jednostkę (PLN). */
  unitNet: string;
  /** Stawka VAT w % (np. 23). */
  vatRate: number;
  /** Suma netto za pozycję = `unitNet * quantity`. */
  totalNet: string;
  /** Kwota VAT za pozycję. */
  totalVat: string;
  /** Suma brutto za pozycję = `totalNet + totalVat`. */
  totalGross: string;
  /** M-09 — etykieta stawki, gdy nie jest liczbą procent (np. „np”). */
  vatLabel?: string;
}

export interface BuildInvoiceContext {
  /** Numer faktury, np. "VFV/2026/05/0042". */
  number: string;
  /**
   * FAK-01 — rodzaj prawny dokumentu. `DOKUMENT_ROZLICZENIOWY` zmienia tytuł
   * i dopisuje adnotację, że fakturę VAT wystawia się odrębnie. Brak pola =
   * faktura VAT (zgodność wstecz z dokumentami sprzed FAK-01).
   */
  rodzajPrawny?: string;
  /** Data wystawienia (PL: data wystawienia ≈ data sprzedaży dla usług abonamentowych). */
  issuedAt: Date;
  /** Data sprzedaży / wykonania usługi (PL VAT: pole obowiązkowe). */
  saleDate: Date;
  /** Termin płatności. */
  dueAt: Date;
  /** Czy faktura jest już opłacona — wpływa na widoczność stopki "Do zapłaty". */
  isPaid: boolean;
  /** Sposób zapłaty (np. "Karta płatnicza (Stripe)", "Portfel Verris", "Przelew"). */
  paymentMethodLabel: string;
  currency: 'PLN' | 'EUR' | 'USD';
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  lineItems: InvoiceLineItem[];
  /** Suma kwot netto (powtórka pozycji). */
  totalNet: string;
  /** Suma VAT. */
  totalVat: string;
  /** Suma brutto. */
  totalGross: string;
  /** Procentowa stawka VAT zsumowana — gdy wszystkie pozycje mają tę samą stawkę. */
  vatRate: number;

  /**
   * M-09/M-10 — podatkowe szczegóły dokumentu: etykieta stawki („np”, „25,5%”),
   * adnotacja („odwrotne obciążenie”), kurs NBP i VAT w PLN przy walucie obcej.
   */
  vat?: {
    etykieta: string;
    adnotacja: string | null;
    kurs: { kurs: number; tabela: string; data: string } | null;
    vatPln: string | null;
  };

  /**
   * M-06 — dane korekty. Obecne WYŁĄCZNIE na dokumencie korygującym.
   *
   * Korekta nie jest fakturą z inną kwotą. Musi pokazać, CO korygowała i CZYM
   * się to skończyło — bez tego nie da się z niej odtworzyć rozliczenia, a to
   * właśnie do tego służy (art. 106j ust. 2).
   */
  korekta?: {
    numerPierwotnej: string;
    dataPierwotnej: Date;
    przyczyna: string;
    /** Kwota brutto PRZED korektą. */
    bruttoPrzed: string;
    /** Kwota brutto PO korekcie. */
    bruttoPo: string;
    /** Różnica ze znakiem: ujemna = zwrot dla klienta. */
    roznicaBrutto: string;
    roznicaNetto: string;
    roznicaVat: string;
    /** Pozycje sprzed korekty — dla porównania. */
    pozycjePrzed: InvoiceLineItem[];
  };
}

/**
 * Renderer PDF dla polskich faktur VAT.
 *
 * Layout (zgodny z typową polską FV):
 *   1. Header: logo Verris + tytuł "Faktura VAT nr {number}"
 *   2. Daty (wystawienia, sprzedaży, terminu płatności) — w tabelce 2-col
 *   3. Sprzedawca + Nabywca obok siebie (2 boxy)
 *   4. Tabela pozycji: Lp / Nazwa / Ilość / Cena netto / VAT% / Wartość netto / Kwota VAT / Wartość brutto
 *   5. Suma + rozbicie VAT w tabelce poniżej
 *   6. "Do zapłaty: X PLN" (lub "Zapłacono" gdy isPaid)
 *   7. Sposób zapłaty + numer konta (jeśli przelew)
 *   8. Footer: dane kontaktowe + adnotacja o archiwizacji
 *
 * Bez podpisów (od 2014 nie są wymagane na polskiej FV).
 *
 * Pdf-lib: bez bibliotek zewnętrznych (LayoutEngine'ów typu pdfmake), pełna
 * kontrola pozycjonowania. Layout jest zaprojektowany pod A4 portrait
 * (595x842 pt) i dynamicznie skalowany jeśli pozycji jest dużo (max 30 na
 * stronę — potem nowa strona z nagłówkiem).
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly config: ConfigService) {}

  async render(ctx: BuildInvoiceContext): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const rozliczeniowy = ctx.rodzajPrawny === RODZAJ_DOKUMENT_ROZLICZENIOWY;
    const proforma = ctx.rodzajPrawny === RODZAJ_PROFORMA;
    pdf.setTitle(
      proforma ? `Proforma ${ctx.number}` : rozliczeniowy ? `Dokument rozliczeniowy ${ctx.number}` : `Faktura ${ctx.number}`,
    );
    pdf.setAuthor(ctx.seller.name);
    pdf.setSubject(
      proforma
        ? `Faktura proforma — ${ctx.number}`
        : rozliczeniowy
          ? `Dokument rozliczeniowy — ${ctx.number}`
          : `Faktura VAT — ${ctx.number}`,
    );
    pdf.setCreator('Verris');
    pdf.setProducer('Verris Panel');
    pdf.setCreationDate(ctx.issuedAt);

    const { regular: fontRegular, bold: fontBold } = await osadzCzcionki(pdf);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 40;

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let cursorY = PAGE_H - MARGIN;

    // --- Header ---------------------------------------------------------------
    page.drawText(ctx.seller.name, {
      x: MARGIN,
      y: cursorY - 8,
      size: 14,
      font: fontBold,
      color: rgb(0.07, 0.13, 0.34), // verris navy-ish
    });
    const tytul = proforma
      ? `Faktura proforma  nr  ${ctx.number}`
      : rozliczeniowy
      ? ctx.korekta
        ? `Korekta dokumentu  nr  ${ctx.number}`
        : `Dokument rozliczeniowy  nr  ${ctx.number}`
      : ctx.korekta
        ? `Faktura korygująca  nr  ${ctx.number}`
        : `Faktura VAT  nr  ${ctx.number}`;
    // Tytuł wyrównany do prawej i zmniejszany, gdy nie mieści się obok nazwy sprzedawcy
    // (stałe x ucinało „Dokument rozliczeniowy nr VDR/…” za krawędzią strony).
    const miejsceNaTytul = PAGE_W - 2 * MARGIN - measureText(ctx.seller.name, fontBold, 14) - 24;
    let rozmiarTytulu = 16;
    while (rozmiarTytulu > 9 && measureText(tytul, fontBold, rozmiarTytulu) > miejsceNaTytul) rozmiarTytulu -= 0.5;
    page.drawText(tytul, {
      x: PAGE_W - MARGIN - measureText(tytul, fontBold, rozmiarTytulu),
      y: cursorY - 8,
      size: rozmiarTytulu,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    cursorY -= 28;

    // Cienka linia pozioma pod nagłówkiem
    page.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: PAGE_W - MARGIN, y: cursorY },
      thickness: 0.7,
      color: rgb(0.4, 0.4, 0.4),
    });
    cursorY -= 18;

    // --- Daty -----------------------------------------------------------------
    const dateLabel = (label: string, value: Date): string =>
      `${label}: ${formatDatePl(value)}`;

    page.drawText(dateLabel('Data wystawienia', ctx.issuedAt), {
      x: MARGIN,
      y: cursorY,
      size: 9,
      font: fontRegular,
    });
    page.drawText(dateLabel('Data sprzedaży', ctx.saleDate), {
      x: MARGIN + 180,
      y: cursorY,
      size: 9,
      font: fontRegular,
    });
    if (ctx.korekta) {
      page.drawText(
        `Koryguje fakturę ${ctx.korekta.numerPierwotnej} z ${ctx.korekta.dataPierwotnej
          .toISOString()
          .slice(0, 10)}`,
        { x: MARGIN, y: cursorY, size: 9, font: fontBold },
      );
      cursorY -= 13;
      // Przyczyna jest polem OBOWIĄZKOWYM (art. 106j ust. 2 pkt 4), więc stoi
      // na dokumencie, a nie tylko w dzienniku audytu.
      page.drawText(`Przyczyna korekty: ${ctx.korekta.przyczyna}`, {
        x: MARGIN,
        y: cursorY,
        size: 9,
        font: fontRegular,
      });
      cursorY -= 15;
    }
    page.drawText(dateLabel('Termin płatności', ctx.dueAt), {
      x: MARGIN + 360,
      y: cursorY,
      size: 9,
      font: fontRegular,
    });
    cursorY -= 22;

    // --- Sprzedawca + Nabywca (2 boxy) ----------------------------------------
    const halfW = (PAGE_W - 2 * MARGIN - 20) / 2;
    const boxTop = cursorY;
    const boxHeight = 110;

    drawBox(page, MARGIN, boxTop, halfW, boxHeight);
    page.drawText('Sprzedawca', {
      x: MARGIN + 8,
      y: boxTop - 12,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    drawSellerOrBuyer(page, ctx.seller, MARGIN + 8, boxTop - 26, fontRegular, fontBold, halfW - 16);

    drawBox(page, MARGIN + halfW + 20, boxTop, halfW, boxHeight);
    page.drawText('Nabywca', {
      x: MARGIN + halfW + 28,
      y: boxTop - 12,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    drawSellerOrBuyer(
      page,
      ctx.buyer,
      MARGIN + halfW + 28,
      boxTop - 26,
      fontRegular,
      fontBold,
      halfW - 16,
    );
    cursorY -= boxHeight + 18;

    // --- Tabela pozycji -------------------------------------------------------
    const tableX = MARGIN;
    const tableW = PAGE_W - 2 * MARGIN;
    const headerH = 22;
    const rowH = 18;

    // Header tła
    page.drawRectangle({
      x: tableX,
      y: cursorY - headerH,
      width: tableW,
      height: headerH,
      color: rgb(0.94, 0.96, 1),
    });
    const cols: Array<{ label: string; w: number; align?: 'left' | 'right' }> = [
      { label: 'Lp.', w: 28, align: 'right' },
      { label: 'Nazwa towaru / usługi', w: 155 },
      { label: 'Il.', w: 30, align: 'right' },
      { label: 'C. netto', w: 60, align: 'right' },
      { label: 'VAT %', w: 40, align: 'right' },
      { label: 'Wart. netto', w: 65, align: 'right' },
      { label: 'Kwota VAT', w: 60, align: 'right' },
      { label: 'Wart. brutto', w: 65, align: 'right' },
    ];

    // Recompute width to make sure fits
    let xRun = tableX + 6;
    for (const col of cols) {
      const labelX = col.align === 'right' ? xRun + col.w - 4 : xRun + 2;
      page.drawText(col.label, {
        x: col.align === 'right' ? labelX - measureText(col.label, fontBold, 8.5) : labelX,
        y: cursorY - 14,
        size: 8.5,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      xRun += col.w;
    }
    cursorY -= headerH;

    // Rows
    let lineNo = 1;
    for (const item of ctx.lineItems) {
      // Nazwa zawijana w kolumnie — wcześniej długa nazwa wchodziła na kolumny z kwotami.
      const linieNazwy = zawin(item.name, fontRegular, 9, cols[1].w - 6);
      const wysokosc = Math.max(rowH, linieNazwy.length * 11 + 7);
      // New page if needed.
      if (cursorY - wysokosc < MARGIN + 200) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
      }
      // Stripe row background every other line.
      if (lineNo % 2 === 0) {
        page.drawRectangle({
          x: tableX,
          y: cursorY - wysokosc,
          width: tableW,
          height: wysokosc,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      const cells = [
        String(lineNo),
        item.name,
        item.quantity.toString(),
        item.unitNet,
        item.vatLabel ?? `${item.vatRate}%`,
        item.totalNet,
        item.totalVat,
        item.totalGross,
      ];
      let xCol = tableX + 6;
      cells.forEach((value, i) => {
        const col = cols[i];
        if (i === 1) {
          linieNazwy.forEach((linia, n) =>
            page.drawText(linia, { x: xCol + 2, y: cursorY - 12 - n * 11, size: 9, font: fontRegular, color: rgb(0, 0, 0) }),
          );
          xCol += col.w;
          return;
        }
        const align = col.align === 'right' ? 'right' : 'left';
        const fontUsed = fontRegular;
        const text = align === 'right'
          ? rightAlign(value, xCol + col.w - 4, fontUsed, 9)
          : { text: value, x: xCol + 2 };
        page.drawText(text.text, {
          x: text.x,
          y: cursorY - 12,
          size: 9,
          font: fontUsed,
          color: rgb(0, 0, 0),
        });
        xCol += col.w;
      });
      cursorY -= wysokosc;
      lineNo += 1;
    }

    // Tabela suma -------------------------------------------------------------
    cursorY -= 6;
    page.drawLine({
      start: { x: tableX, y: cursorY },
      end: { x: tableX + tableW, y: cursorY },
      thickness: 0.7,
      color: rgb(0.6, 0.6, 0.6),
    });
    cursorY -= 18;

    const summaryX = tableX + tableW - 220;
    drawSummaryRow(page, summaryX, cursorY, 'Razem netto', `${ctx.totalNet} ${ctx.currency}`, fontRegular);
    cursorY -= 16;
    drawSummaryRow(
      page,
      summaryX,
      cursorY,
      `VAT ${ctx.vat?.etykieta ?? `${ctx.vatRate}%`}`,
      `${ctx.totalVat} ${ctx.currency}`,
      fontRegular,
    );
    cursorY -= 16;
    drawSummaryRow(
      page,
      summaryX,
      cursorY,
      'Razem brutto',
      `${ctx.totalGross} ${ctx.currency}`,
      fontBold,
      11,
    );
    cursorY -= 24;

    if (ctx.korekta) {
      // Na korekcie „Do zapłaty" nie znaczy nic — dokument nie żąda zapłaty,
      // tylko zmienia rozliczenie. Znaczenie ma RÓŻNICA i jej kierunek.
      const k = ctx.korekta;
      const ujemna = k.roznicaBrutto.trim().startsWith('-');
      const etykieta = ujemna
        ? `Do zwrotu klientowi: ${k.roznicaBrutto.replace('-', '')} ${ctx.currency}`
        : `Do dopłaty przez klienta: ${k.roznicaBrutto} ${ctx.currency}`;

      for (const [opis, wartosc] of [
        ['Wartość przed korektą', `${k.bruttoPrzed} ${ctx.currency}`],
        ['Wartość po korekcie', `${k.bruttoPo} ${ctx.currency}`],
        ['Różnica', `${k.roznicaBrutto} ${ctx.currency}`],
      ] as Array<[string, string]>) {
        page.drawText(opis, { x: PAGE_W - MARGIN - 260, y: cursorY, size: 9, font: fontRegular });
        page.drawText(wartosc, {
          x: PAGE_W - MARGIN - measureText(wartosc, fontRegular, 9),
          y: cursorY,
          size: 9,
          font: fontRegular,
        });
        cursorY -= 13;
      }
      cursorY -= 4;
      page.drawText(etykieta, {
        x: PAGE_W - MARGIN - measureText(etykieta, fontBold, 12),
        y: cursorY,
        size: 12,
        font: fontBold,
        color: ujemna ? rgb(0.05, 0.45, 0.2) : rgb(0.7, 0.1, 0.1),
      });
      cursorY -= 22;
    } else {
      // Do zapłaty / Zapłacono
      const dueLabel = ctx.isPaid
        ? `Zapłacono: ${ctx.totalGross} ${ctx.currency}`
        : `Do zapłaty: ${ctx.totalGross} ${ctx.currency}`;
      page.drawText(dueLabel, {
        x: PAGE_W - MARGIN - measureText(dueLabel, fontBold, 13),
        y: cursorY,
        size: 13,
        font: fontBold,
        color: ctx.isPaid ? rgb(0.05, 0.45, 0.2) : rgb(0.7, 0.1, 0.1),
      });
      cursorY -= 22;
    }

    page.drawText(`Forma zapłaty: ${ctx.paymentMethodLabel}`, {
      x: MARGIN,
      y: cursorY,
      size: 9,
      font: fontRegular,
    });
    cursorY -= 14;
    if (ctx.seller.bankAccount) {
      page.drawText(`Numer konta: ${ctx.seller.bankAccount}`, {
        x: MARGIN,
        y: cursorY,
        size: 9,
        font: fontRegular,
      });
      cursorY -= 14;
    }

    if (ctx.vat?.kurs) {
      const k = ctx.vat.kurs;
      page.drawText(
        `Kurs średni NBP ${ctx.currency}: ${k.kurs.toFixed(4)} PLN (tabela ${k.tabela} z ${k.data})` +
          (ctx.vat.vatPln !== null ? `; kwota VAT w PLN: ${ctx.vat.vatPln} zł` : ''),
        { x: MARGIN, y: cursorY, size: 9, font: fontRegular },
      );
      cursorY -= 14;
    }
    if (ctx.vat?.adnotacja) {
      for (const linia of zawin(ctx.vat.adnotacja, fontBold, 9, PAGE_W - 2 * MARGIN)) {
        page.drawText(linia, { x: MARGIN, y: cursorY, size: 9, font: fontBold });
        cursorY -= 13;
      }
    }

    if (proforma) {
      cursorY -= 6;
      for (const linia of ADNOTACJA_PROFORMY) {
        page.drawText(linia, { x: MARGIN, y: cursorY, size: 9, font: fontBold });
        cursorY -= 13;
      }
    }

    if (rozliczeniowy) {
      // Bez tej adnotacji dokument z NIP-ami, pozycjami i kwotą VAT wygląda
      // jak faktura — i klient zaksięgowałby go jako fakturę.
      cursorY -= 6;
      for (const linia of ADNOTACJA_DOKUMENTU_ROZLICZENIOWEGO) {
        page.drawText(linia, { x: MARGIN, y: cursorY, size: 9, font: fontBold });
        cursorY -= 13;
      }
    }

    // Footer ------------------------------------------------------------------
    const footY = MARGIN;
    page.drawLine({
      start: { x: MARGIN, y: footY + 22 },
      end: { x: PAGE_W - MARGIN, y: footY + 22 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    const footnote = [
      `${ctx.seller.name} • NIP ${ctx.seller.nip}`,
      ctx.seller.regon ? `REGON ${ctx.seller.regon}` : null,
      ctx.seller.krs ? `KRS ${ctx.seller.krs}` : null,
      ctx.seller.email,
    ]
      .filter(Boolean)
      .join('  •  ');
    page.drawText(footnote, {
      x: MARGIN,
      y: footY + 8,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
    page.drawText('Dokument wygenerowany elektronicznie. Nie wymaga podpisu.', {
      x: MARGIN,
      y: footY - 3,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });

    return await pdf.save();
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function drawBox(
  page: ReturnType<PDFDocument['addPage']>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  page.drawRectangle({
    x,
    y: y - h,
    width: w,
    height: h,
    borderColor: rgb(0.7, 0.75, 0.85),
    borderWidth: 0.5,
    color: rgb(1, 1, 1),
  });
}

function drawSellerOrBuyer(
  page: ReturnType<PDFDocument['addPage']>,
  data: SellerSnapshot | BuyerSnapshot,
  x: number,
  yTop: number,
  fontRegular: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  maxW = 230,
): void {
  let y = yTop;
  // Nazwa i adres zawijane w ramce (box ma stałą wysokość 110 pt → maks. 2 linie nazwy).
  for (const linia of zawin(data.name, fontBold, 10, maxW).slice(0, 2)) {
    page.drawText(linia, { x, y, size: 10, font: fontBold });
    y -= 12;
  }
  if ('nip' in data && data.nip) {
    // M-09: nabywca z zagranicy ma numer VAT swojego kraju, nie polski NIP.
    const etykieta = data.country && data.country !== 'PL' ? 'VAT' : 'NIP';
    page.drawText(`${etykieta}: ${data.nip}`, { x, y, size: 9, font: fontRegular });
    y -= 11;
  }
  if (data.address) {
    for (const linia of zawin(data.address, fontRegular, 9, maxW).slice(0, 2)) {
      page.drawText(linia, { x, y, size: 9, font: fontRegular });
      y -= 11;
    }
  }
  if (data.postalCode || data.city) {
    page.drawText(`${data.postalCode ?? ''} ${data.city ?? ''}`.trim(), {
      x,
      y,
      size: 9,
      font: fontRegular,
    });
    y -= 11;
  }
  if (data.country && data.country !== 'PL') {
    page.drawText(data.country, { x, y, size: 9, font: fontRegular });
    y -= 11;
  }
  page.drawText(data.email, { x, y, size: 9, font: fontRegular });
}

function drawSummaryRow(
  page: ReturnType<PDFDocument['addPage']>,
  x: number,
  y: number,
  label: string,
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size = 10,
): void {
  page.drawText(label, { x, y, size, font });
  page.drawText(value, {
    x: x + 220 - measureText(value, font, size),
    y,
    size,
    font,
  });
}

function measureText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
): number {
  return font.widthOfTextAtSize(text, size);
}

/**
 * M-07 — nadruk „DUPLIKAT z dnia …” w prawym górnym rogu każdej strony zapisanego PDF-a.
 * Treść dokumentu zostaje bez zmian.
 */
export async function nadrukDuplikatu(oryginal: Uint8Array, dnia: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(oryginal);
  const { bold } = await osadzCzcionki(pdf);
  const tekst = `DUPLIKAT z dnia ${formatDatePl(dnia)}`;
  const size = 10;
  const w = measureText(tekst, bold, size);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(tekst, { x: width - 40 - w, y: height - 22, size, font: bold, color: rgb(0.75, 0.1, 0.1) });
  }
  return pdf.save();
}

/** Dzieli tekst na linie mieszczące się w `maxW` (po słowach; zbyt długie słowo — po znakach). */
export function zawin(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  maxW: number,
): string[] {
  const linie: string[] = [];
  let biezaca = '';
  for (const slowo of text.split(/\s+/).filter(Boolean)) {
    const proba = biezaca ? `${biezaca} ${slowo}` : slowo;
    if (measureText(proba, font, size) <= maxW) {
      biezaca = proba;
      continue;
    }
    if (biezaca) linie.push(biezaca);
    biezaca = '';
    let kawalek = '';
    for (const znak of slowo) {
      if (kawalek && measureText(kawalek + znak, font, size) > maxW) {
        linie.push(kawalek);
        kawalek = '';
      }
      kawalek += znak;
    }
    biezaca = kawalek;
  }
  if (biezaca) linie.push(biezaca);
  return linie.length ? linie : [''];
}

function rightAlign(
  text: string,
  rightX: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
): { text: string; x: number } {
  return { text, x: rightX - measureText(text, font, size) };
}

function formatDatePl(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Suppress unused — exported for future tests; pdf-lib does not use Prisma.
// ---------------------------------------------------------------------------
void Prisma;

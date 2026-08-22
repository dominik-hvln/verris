import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Prisma } from '@verris/database';

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
}

export interface BuildInvoiceContext {
  /** Numer faktury, np. "VFV/2026/05/0042". */
  number: string;
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
    pdf.setTitle(`Faktura ${ctx.number}`);
    pdf.setAuthor(ctx.seller.name);
    pdf.setSubject(`Faktura VAT — ${ctx.number}`);
    pdf.setCreator('Verris');
    pdf.setProducer('Verris Panel');
    pdf.setCreationDate(ctx.issuedAt);

    const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

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
    const tytul = ctx.korekta
      ? `Faktura korygująca  nr  ${ctx.number}`
      : `Faktura VAT  nr  ${ctx.number}`;
    page.drawText(tytul, {
      x: PAGE_W - MARGIN - 250,
      y: cursorY - 8,
      size: 16,
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
    drawSellerOrBuyer(page, ctx.seller, MARGIN + 8, boxTop - 26, fontRegular, fontBold);

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
      { label: 'Nazwa towaru / usługi', w: 200 },
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
      // New page if needed.
      if (cursorY - rowH < MARGIN + 200) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
      }
      // Stripe row background every other line.
      if (lineNo % 2 === 0) {
        page.drawRectangle({
          x: tableX,
          y: cursorY - rowH,
          width: tableW,
          height: rowH,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      const cells = [
        String(lineNo),
        item.name,
        item.quantity.toString(),
        item.unitNet,
        `${item.vatRate}%`,
        item.totalNet,
        item.totalVat,
        item.totalGross,
      ];
      let xCol = tableX + 6;
      cells.forEach((value, i) => {
        const col = cols[i];
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
      cursorY -= rowH;
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
      `VAT ${ctx.vatRate}%`,
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
    page.drawText('Faktura wygenerowana elektronicznie. Nie wymaga podpisu.', {
      x: PAGE_W - MARGIN - 220,
      y: footY + 8,
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
): void {
  let y = yTop;
  page.drawText(data.name, { x, y, size: 10, font: fontBold });
  y -= 12;
  if ('nip' in data && data.nip) {
    page.drawText(`NIP: ${data.nip}`, { x, y, size: 9, font: fontRegular });
    y -= 11;
  }
  if (data.address) {
    page.drawText(data.address, { x, y, size: 9, font: fontRegular });
    y -= 11;
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

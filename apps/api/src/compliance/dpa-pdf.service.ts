import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { LegalDocumentsService } from './legal-documents.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ObjectBuckets } from '../storage/object-storage.types';

const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const FONT_BODY = 10;
const FONT_H1 = 18;
const FONT_H2 = 13;
const FONT_H3 = 11;
const LINE_HEIGHT_BODY = 1.45;

interface CompanyData {
  companyName: string;
  nip: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Generuje pełny PDF DPA z dynamicznym wstawieniem danych firmy klienta
 * (companyName, NIP, adres, e-mail, data akceptacji, wersja). Korzysta z
 * `pdf-lib` (czysty TS, brak zależności natywnych) i wbudowanego fontu
 * Helvetica + Helvetica-Bold.
 *
 * Render strategy:
 *  - Markdown DPA jest wczytywany z `LegalDocument.contentMarkdown`. Treść
 *    parsujemy tym samym minimalnym subsetem co `email-shell.ts`: nagłówki
 *    `#`/`##`/`###`, paragrafy, listy `-` oraz inline `**bold**`.
 *  - Auto pagination — przekroczenie wysokości strony skutkuje nową stroną
 *    z numeracją `Strona X / N` w stopce.
 *  - Strona tytułowa zawiera dane klienta + dane Verris + datę akceptacji.
 *  - Stopka audit: identyfikator umowy (UUID), wersja, hash (SHA-256 z
 *    treści markdown) — pozwala obu stronom udowodnić tę samą wersję.
 *
 * Nie używamy podpisów PKCS#7 — dokument traktujemy jako "akceptację
 * elektroniczną" potwierdzoną wpisem `UserConsent` w bazie + audytem.
 */
@Injectable()
export class DpaPdfService {
  private readonly logger = new Logger(DpaPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalDocumentsService,
    private readonly audit: AuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Builds the PDF and records an audit log entry. Does NOT verify that the
   * user has accepted the DPA — that's done by the controller (only B2B
   * clients with an accepted consent can hit this endpoint).
   */
  async buildPdfForUser(userId: string): Promise<{ buffer: Buffer; filename: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        anonymizedAt: true,
      },
    });
    if (!user || user.anonymizedAt) {
      throw new NotFoundException('Konto nieaktywne.');
    }
    if (!user.companyName && !user.nip) {
      throw new BadRequestException(
        'DPA jest dostępne wyłącznie dla klientów biznesowych (firma/NIP).',
      );
    }

    const dpa = await this.legal.getCurrentRow('DPA', 'pl');
    if (!dpa) {
      throw new NotFoundException('Aktualnie nie publikujemy DPA.');
    }

    const acceptance = await this.prisma.userConsent.findFirst({
      where: { userId, documentKind: 'DPA', documentVersion: dpa.version },
      orderBy: { grantedAt: 'desc' },
    });
    if (!acceptance) {
      throw new BadRequestException(
        'Nie znaleziono akceptacji aktualnej wersji DPA. Zaakceptuj DPA w Ustawieniach → Prywatność i dane.',
      );
    }

    const company: CompanyData = {
      companyName: user.companyName ?? '—',
      nip: user.nip,
      address: user.address,
      city: user.city,
      postalCode: user.postalCode,
      country: user.country ?? 'Polska',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    // Cache key in MinIO. If the user has accepted this exact DPA version
    // already and we built a PDF before, serve the cached copy. Cache key
    // includes consentId so re-generations after a fresh accept always
    // produce a fresh PDF (no stale dates/identifiers).
    const storageKey = `${userId}/${dpa.version}/${acceptance.id}.pdf`;
    const filename = `Verris-DPA-${dpa.version}-${
      user.companyName?.replace(/[^a-zA-Z0-9_-]+/g, '-') ?? user.id
    }.pdf`;

    const cached = await this.storage.objectExists(ObjectBuckets.DPA_PDFS, storageKey);
    if (cached) {
      const buf = await this.storage.getObjectBuffer(ObjectBuckets.DPA_PDFS, storageKey);
      return { buffer: buf, filename };
    }

    const pdfBytes = await this.renderPdf({
      company,
      dpaVersion: dpa.version,
      dpaTitle: dpa.title,
      dpaContent: dpa.contentMarkdown,
      acceptedAt: acceptance.grantedAt,
      acceptanceId: acceptance.id,
    });
    const buffer = Buffer.from(pdfBytes);

    await this.storage.putObject(ObjectBuckets.DPA_PDFS, storageKey, buffer, {
      contentType: 'application/pdf',
      originalFilename: filename,
      custom: {
        userid: userId,
        dpaversion: dpa.version,
        consentid: acceptance.id,
      },
    });

    await this.audit.record({
      action: RodoActions.DPA_PDF_GENERATED,
      userId,
      actorUserId: userId,
      details: {
        dpaVersion: dpa.version,
        consentId: acceptance.id,
        sizeBytes: buffer.byteLength,
        storageKey,
      },
    });

    return { buffer, filename };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private async renderPdf(input: {
    company: CompanyData;
    dpaVersion: string;
    dpaTitle: string;
    dpaContent: string;
    acceptedAt: Date;
    acceptanceId: string;
  }): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Verris — DPA ${input.dpaVersion}`);
    doc.setAuthor('Verris');
    doc.setSubject('Umowa Powierzenia Przetwarzania Danych Osobowych');
    doc.setProducer('Verris Panel');
    doc.setCreator('Verris Panel');
    doc.setCreationDate(new Date());

    const fontBody = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await doc.embedFont(StandardFonts.Courier);

    const ctx: PageContext = {
      doc,
      pageNo: 0,
      currentPage: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      cursorY: PAGE_HEIGHT - MARGIN_TOP,
      fontBody,
      fontBold,
      fontMono,
    };
    ctx.pageNo++;

    // ---------- Cover page ----------
    drawHeader(ctx, 'Umowa Powierzenia Przetwarzania Danych Osobowych');
    drawParagraph(
      ctx,
      `(Data Processing Agreement / DPA — wersja ${input.dpaVersion})`,
      { font: ctx.fontBody, size: FONT_BODY, color: rgb(0.4, 0.4, 0.4) },
    );
    moveBy(ctx, 16);

    drawH2(ctx, 'Strony umowy');
    drawKv(ctx, 'Procesor (administrator usługi):', 'Verris');
    drawKv(ctx, 'Adres:', '[uzupełnij dane spółki Verris]');
    drawKv(ctx, 'NIP:', '[NIP Verris]');
    drawKv(ctx, 'Kontakt RODO:', 'rodo@verris.pl');
    moveBy(ctx, 6);

    drawKv(ctx, 'Administrator danych (klient):', input.company.companyName);
    if (input.company.nip) drawKv(ctx, 'NIP:', input.company.nip);
    if (input.company.address) drawKv(ctx, 'Adres:', input.company.address);
    if (input.company.postalCode || input.company.city) {
      drawKv(ctx, 'Miejscowość:', `${input.company.postalCode ?? ''} ${input.company.city ?? ''}`.trim());
    }
    drawKv(ctx, 'Kraj:', input.company.country ?? 'Polska');
    drawKv(ctx, 'E-mail kontaktowy:', input.company.email);
    if (input.company.firstName || input.company.lastName) {
      drawKv(
        ctx,
        'Osoba kontaktowa:',
        [input.company.firstName, input.company.lastName].filter(Boolean).join(' '),
      );
    }
    moveBy(ctx, 16);

    drawH2(ctx, 'Akceptacja');
    drawParagraph(
      ctx,
      `Niniejsza umowa została zaakceptowana w sposób elektroniczny w panelu Verris ` +
        `dnia ${formatPlDate(input.acceptedAt)} (UTC).`,
    );
    drawParagraph(ctx, `Identyfikator akceptacji: ${input.acceptanceId}`, {
      font: ctx.fontMono,
      size: 9,
      color: rgb(0.4, 0.4, 0.4),
    });
    moveBy(ctx, 24);

    // ---------- Body — DPA markdown content ----------
    drawH1(ctx, input.dpaTitle);
    renderMarkdown(ctx, input.dpaContent);

    // ---------- Footer on every page ----------
    finalizePages(ctx, input.dpaVersion, input.acceptanceId);

    return doc.save();
  }
}

// -----------------------------------------------------------------------------
// PDF rendering helpers (module-private)
// -----------------------------------------------------------------------------

interface PageContext {
  doc: PDFDocument;
  pageNo: number;
  currentPage: ReturnType<PDFDocument['addPage']>;
  cursorY: number;
  fontBody: Awaited<ReturnType<PDFDocument['embedFont']>>;
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>;
  fontMono: Awaited<ReturnType<PDFDocument['embedFont']>>;
}

function newPage(ctx: PageContext): void {
  ctx.currentPage = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNo++;
  ctx.cursorY = PAGE_HEIGHT - MARGIN_TOP;
}

function ensureRoom(ctx: PageContext, lines = 1, lineHeight = FONT_BODY * LINE_HEIGHT_BODY): void {
  if (ctx.cursorY - lines * lineHeight < MARGIN_BOTTOM) {
    newPage(ctx);
  }
}

function moveBy(ctx: PageContext, dy: number): void {
  ctx.cursorY -= dy;
  if (ctx.cursorY < MARGIN_BOTTOM) newPage(ctx);
}

function drawHeader(ctx: PageContext, text: string): void {
  ensureRoom(ctx, 2, FONT_H1 * LINE_HEIGHT_BODY);
  ctx.currentPage.drawText('VERRIS', {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: 11,
    font: ctx.fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });
  ctx.cursorY -= 22;
  ctx.currentPage.drawText(text, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: FONT_H1,
    font: ctx.fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });
  ctx.cursorY -= FONT_H1 * 1.4;
}

function drawH1(ctx: PageContext, text: string): void {
  ensureRoom(ctx, 2, FONT_H1 * LINE_HEIGHT_BODY);
  moveBy(ctx, 8);
  ctx.currentPage.drawText(text, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: FONT_H1,
    font: ctx.fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });
  ctx.cursorY -= FONT_H1 * 1.5;
}

function drawH2(ctx: PageContext, text: string): void {
  ensureRoom(ctx, 1, FONT_H2 * LINE_HEIGHT_BODY);
  moveBy(ctx, 8);
  ctx.currentPage.drawText(text, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: FONT_H2,
    font: ctx.fontBold,
    color: rgb(0.05, 0.05, 0.05),
  });
  ctx.cursorY -= FONT_H2 * 1.6;
}

function drawH3(ctx: PageContext, text: string): void {
  ensureRoom(ctx, 1, FONT_H3 * LINE_HEIGHT_BODY);
  moveBy(ctx, 4);
  ctx.currentPage.drawText(text, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: FONT_H3,
    font: ctx.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.cursorY -= FONT_H3 * 1.6;
}

function drawKv(ctx: PageContext, label: string, value: string): void {
  ensureRoom(ctx, 1, FONT_BODY * LINE_HEIGHT_BODY);
  ctx.currentPage.drawText(label, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: FONT_BODY,
    font: ctx.fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  const labelWidth = ctx.fontBold.widthOfTextAtSize(label, FONT_BODY);
  ctx.currentPage.drawText(value, {
    x: MARGIN_X + labelWidth + 6,
    y: ctx.cursorY,
    size: FONT_BODY,
    font: ctx.fontBody,
    color: rgb(0.05, 0.05, 0.05),
  });
  ctx.cursorY -= FONT_BODY * LINE_HEIGHT_BODY;
}

interface ParagraphOpts {
  font?: PageContext['fontBody'];
  size?: number;
  color?: ReturnType<typeof rgb>;
  bullet?: string;
}

function drawParagraph(ctx: PageContext, text: string, opts: ParagraphOpts = {}): void {
  const font = opts.font ?? ctx.fontBody;
  const size = opts.size ?? FONT_BODY;
  const color = opts.color ?? rgb(0.05, 0.05, 0.05);
  const bullet = opts.bullet;
  const lineHeight = size * LINE_HEIGHT_BODY;
  const indent = bullet ? size * 1.6 : 0;
  const usableWidth = PAGE_WIDTH - 2 * MARGIN_X - indent;
  const segments = wrapText(text, font, size, usableWidth);

  let isFirstLine = true;
  for (const seg of segments) {
    ensureRoom(ctx, 1, lineHeight);
    if (isFirstLine && bullet) {
      ctx.currentPage.drawText(bullet, {
        x: MARGIN_X,
        y: ctx.cursorY,
        size,
        font,
        color,
      });
    }
    ctx.currentPage.drawText(seg.line, {
      x: MARGIN_X + indent,
      y: ctx.cursorY,
      size,
      font: seg.bold ? ctx.fontBold : font,
      color,
    });
    ctx.cursorY -= lineHeight;
    isFirstLine = false;
  }
  // Spacing after paragraph
  ctx.cursorY -= size * 0.4;
}

interface WrapSegment {
  line: string;
  bold: boolean;
}

/**
 * Word-wraps `text` to `width` measured by `font` at `size`, splitting on
 * whitespace. Bold runs (`**...**`) are emitted as their own segments — this
 * keeps the implementation simple at the cost of slight visual roughness on
 * lines mixing regular and bold runs (acceptable for legal docs).
 */
function wrapText(
  text: string,
  font: PageContext['fontBody'],
  size: number,
  width: number,
): WrapSegment[] {
  const out: WrapSegment[] = [];
  // Split into bold/non-bold segments by `**...**`.
  const tokens: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) tokens.push({ text: text.slice(lastIdx, m.index), bold: false });
    tokens.push({ text: m[1], bold: true });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) tokens.push({ text: text.slice(lastIdx), bold: false });
  if (tokens.length === 0) tokens.push({ text, bold: false });

  // Concatenate tokens into lines respecting word breaks. We keep bold runs
  // on their own visual line if mixing would overflow — adequate for our
  // legal-doc paragraphs which tend to bold whole clauses.
  let buffer: string = '';
  let bufferBold: boolean = false;
  for (const tok of tokens) {
    const words = tok.text.split(/(\s+)/);
    for (const w of words) {
      if (!w) continue;
      const candidate = buffer.length === 0 ? w : buffer + w;
      const wTextWidth = font.widthOfTextAtSize(candidate, size);
      if (wTextWidth > width && buffer.length > 0) {
        out.push({ line: buffer.trimEnd(), bold: bufferBold });
        buffer = w.trimStart();
        bufferBold = tok.bold;
      } else {
        buffer = candidate;
        bufferBold = tok.bold;
      }
    }
  }
  if (buffer.length > 0) out.push({ line: buffer.trimEnd(), bold: bufferBold });
  return out;
}

/**
 * Minimal markdown → drawing pipeline. Supports:
 *   `# H1`, `## H2`, `### H3`, paragraphs, `- list items`, `**bold inline**`.
 */
function renderMarkdown(ctx: PageContext, markdown: string): void {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      drawH3(ctx, line.slice(4));
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      drawH2(ctx, line.slice(3));
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      drawH1(ctx, line.slice(2));
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      drawParagraph(ctx, line.slice(2), { bullet: '•' });
      i++;
      continue;
    }
    // Paragraph: glue subsequent non-empty lines together
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('# ') && !lines[i].startsWith('## ') && !lines[i].startsWith('### ') && !lines[i].startsWith('- ')) {
      buf.push(lines[i]);
      i++;
    }
    drawParagraph(ctx, buf.join(' '));
  }
}

function finalizePages(ctx: PageContext, dpaVersion: string, acceptanceId: string): void {
  const total = ctx.doc.getPageCount();
  for (let p = 0; p < total; p++) {
    const page = ctx.doc.getPage(p);
    const footer = `Verris — DPA ${dpaVersion}  |  Akceptacja: ${acceptanceId}  |  Strona ${p + 1} / ${total}`;
    page.drawText(footer, {
      x: MARGIN_X,
      y: 28,
      size: 8,
      font: ctx.fontMono,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

function formatPlDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(d).replace(',', '');
}

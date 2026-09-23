import * as fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import { DEJAVU_SANS, DEJAVU_SANS_BOLD, DEJAVU_SANS_MONO } from './czcionki.generated';

/**
 * Czcionki z polskimi znakami dla dokumentów PDF (faktury, proformy, DPA).
 *
 * Standardowe czcionki PDF (StandardFonts.Helvetica/Courier) mają kodowanie WinAnsi,
 * w którym nie ma „ą ę ł ń ś ź ż” — pdf-lib rzuca wyjątkiem przy pierwszym takim znaku,
 * a nagłówek faktury zawiera „Data sprzedaży”. Do 2026-09-23 renderer faktur i DPA
 * padał więc na KAŻDYM dokumencie. Test: src/common/pdf/czcionki.spec.ts.
 */
export async function osadzCzcionki(
  pdf: PDFDocument,
): Promise<{ regular: PDFFont; bold: PDFFont; mono: PDFFont }> {
  pdf.registerFontkit(fontkit);
  const [regular, bold, mono] = await Promise.all([
    pdf.embedFont(Buffer.from(DEJAVU_SANS, 'base64'), { subset: true }),
    pdf.embedFont(Buffer.from(DEJAVU_SANS_BOLD, 'base64'), { subset: true }),
    pdf.embedFont(Buffer.from(DEJAVU_SANS_MONO, 'base64'), { subset: true }),
  ]);
  return { regular, bold, mono };
}

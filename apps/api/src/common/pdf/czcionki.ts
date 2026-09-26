import * as fontkitModul from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];

/**
 * Ten sam import ma dwa kształty. Jest (CommonJS) bierze z paczki pole `main` (UMD) i dostaje
 * obiekt z `create`. Webpack w obrazie produkcyjnym bierze pole `module` (ESM, tylko
 * `export default fontkit`) i `import * as` daje przestrzeń nazw `{ default }` bez `create`.
 * 2026-09-23: testy zielone, a na produkcji KAŻDY PDF (faktury, proformy, DPA) kończył się 500.
 */
export function fontkitZModulu(modul: unknown): Fontkit {
  const m = modul as { create?: unknown; default?: { create?: unknown } };
  if (typeof m?.create === 'function') return m as Fontkit;
  if (typeof m?.default?.create === 'function') return m.default as Fontkit;
  throw new Error('@pdf-lib/fontkit: brak funkcji create — nieznany kształt modułu');
}
const fontkit = fontkitZModulu(fontkitModul);
import { DEJAVU_SANS, DEJAVU_SANS_BOLD, DEJAVU_SANS_MONO } from './czcionki.generated.js';

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

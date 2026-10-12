import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { fakturaB2B, xmlFaktury } from '../test/faktury-ksef-testowe.js';
import { renderujFaktureKsefZTekstem } from './faktura-ksef-pdf.js';
import { linkWeryfikacjiKsef, skrotFakturyBase64Url } from './kod-qr-ksef.js';
import { wizualizacjaFa3 } from './wizualizacja-fa3.js';

/**
 * 12.10: PDF faktury z KSeF wychodził w granatowym, generycznym stylu — bez znaku, krojów
 * i kolorów Verris. Teraz: lockup i kroje marki (Hanken Grotesk, JetBrains Mono), a znaki spoza
 * ich podzbioru, które ma DejaVu (np. „✓” w nazwie), idą krojem zapasowym zamiast pustych prostokątów.
 */
async function krojeWPdf(pdf: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  const nazwy = new Set<string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue;
    const bazowa = obj.get(PDFName.of('BaseFont'));
    if (bazowa) nazwy.add(bazowa.toString().replace(/^\/[A-Z]{6}\+/, '/'));
  }
  return [...nazwy];
}

function wizualizacja(nabywca?: string) {
  const xml = xmlFaktury(fakturaB2B());
  const wiz = wizualizacjaFa3(xml);
  if (nabywca) wiz.nabywca = { ...wiz.nabywca, nazwa: nabywca };
  const meta = {
    numerKsef: null,
    przyjetoWKsef: null,
    linkWeryfikacji: linkWeryfikacjiKsef('test', wiz.sprzedawca.nip!, wiz.dataWystawienia, skrotFakturyBase64Url(xml)),
    srodowisko: 'test' as const,
  };
  return { wiz, meta };
}

describe('PDF faktury KSeF — marka Verris', () => {
  it('kroje marki: Hanken Grotesk w tekście, JetBrains Mono w kwotach; bez DejaVu, gdy niepotrzebny', async () => {
    const { wiz, meta } = wizualizacja();
    const kroje = await krojeWPdf((await renderujFaktureKsefZTekstem(wiz, meta)).pdf);
    expect(kroje.some((k) => k.includes('HankenGrotesk'))).toBe(true);
    expect(kroje.some((k) => k.includes('JetBrainsMono'))).toBe(true);
    expect(kroje.some((k) => k.includes('DejaVu'))).toBe(false);
  });

  it('znak spoza kroju marki w nazwie nabywcy: wydrukowany krojem zapasowym (DejaVu)', async () => {
    const { wiz, meta } = wizualizacja('Firma ✓ Sp. z o.o.');
    const { pdf, teksty } = await renderujFaktureKsefZTekstem(wiz, meta);
    expect(teksty).toContain('Firma ✓ Sp. z o.o.');
    expect((await krojeWPdf(pdf)).some((k) => k.includes('DejaVuSans-Bold'))).toBe(true);
  });
});

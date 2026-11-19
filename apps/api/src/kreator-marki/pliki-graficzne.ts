import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/**
 * Kreator marki (paczka 131) – pliki rastrowe: PNG z SVG (sharp/librsvg, przezroczyste tło), metadane AI w PNG
 * (pakiet XMP w chunku iTXt „XML:com.adobe.xmp” – XMP Specification Part 3, PNG; chunk iTXt – PNG Specification
 * (W3C) 11.3.4.5) i favicon.ico składany ręcznie z PNG (format ICO: ICONDIR + ICONDIRENTRY × n + obrazy PNG –
 * https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10); PNG w ICO obsługiwany od Windows Vista).
 *
 * Napisy w SVG MUSZĄ być wcześniej na krzywych (NapisMarkiService.tekstNaKrzywe) – librsvg na serwerze nie ma
 * krojów z katalogu i podstawiłby krój zastępczy.
 */

/** Rodzaj źródła do metadanych (jak `zrodloMetadanych` z biblioteki marki). */
export type ZrodloMetadanych = 'ai' | 'kompozycja' | 'brak';

const TYP_ZRODLA: Record<Exclude<ZrodloMetadanych, 'brak'>, string> = {
  ai: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  kompozycja: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
};

/** Pakiet XMP „wygenerowano z pomocą AI” (IPTC DigitalSourceType) – PNG i PDF. Bez danych konta. */
export function pakietXmp(zrodlo: ZrodloMetadanych, tytul?: string): string {
  const typ = zrodlo === 'brak' ? '' : ` Iptc4xmpExt:DigitalSourceType="${TYP_ZRODLA[zrodlo]}"`;
  const opis = zrodlo === 'brak' ? 'Materiał przygotowany w Verris Kreator marki.' : 'Wygenerowano z pomocą AI – Verris Kreator marki.';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    `${typ} xmp:CreatorTool="Verris Kreator marki">`,
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${opis}</rdf:li></rdf:Alt></dc:description>`,
    tytul ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(tytul)}</rdf:li></rdf:Alt></dc:title>` : '',
    '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>',
  ].join('');
}

const SYGNATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(typ: string, dane: Buffer): Buffer {
  const dl = Buffer.alloc(4);
  dl.writeUInt32BE(dane.length);
  const t = Buffer.from(typ, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dane])) >>> 0);
  return Buffer.concat([dl, t, dane, crc]);
}

/** Wstawia chunk iTXt z XMP zaraz po IHDR (XMP przed danymi obrazu – czytniki strumieniowe go zobaczą). */
export function wstawXmpPng(png: Buffer, xmp: string): Buffer {
  if (!png.subarray(0, 8).equals(SYGNATURA_PNG)) throw new Error('To nie jest plik PNG.');
  const ihdrKoniec = 8 + 8 + png.readUInt32BE(8) + 4;
  // iTXt: słowo kluczowe \0, flaga kompresji 0, metoda 0, język \0, przetłumaczone słowo \0, tekst UTF-8
  const dane = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'), Buffer.from(xmp, 'utf8')]);
  return Buffer.concat([png.subarray(0, ihdrKoniec), chunk('iTXt', dane), png.subarray(ihdrKoniec)]);
}

/** Odczyt XMP z PNG (testy, diagnostyka) – treść pierwszego chunku iTXt „XML:com.adobe.xmp” albo null. */
export function odczytajXmpPng(png: Buffer): string | null {
  let i = 8;
  while (i + 8 <= png.length) {
    const dl = png.readUInt32BE(i);
    const typ = png.toString('latin1', i + 4, i + 8);
    if (typ === 'iTXt') {
      const d = png.subarray(i + 8, i + 8 + dl);
      if (d.toString('latin1', 0, 18) === 'XML:com.adobe.xmp\0') return d.subarray(22).toString('utf8');
    }
    if (typ === 'IEND') break;
    i += 12 + dl;
  }
  return null;
}

export interface OpcjePng {
  /** Szerokość wyniku w px (wysokość z proporcji); albo `wysokosc`. */
  szerokosc?: number;
  wysokosc?: number;
  /** Metadane AI (XMP w iTXt). */
  xmp?: string;
  /** Tło (domyślnie przezroczyste). */
  tlo?: string;
}

/** Najdłuższy bok PNG z kreatora marki (ochrona pamięci: 4096² × 4 B ≈ 64 MB). */
export const MAKS_BOK_PNG = 4096;

/** PNG z SVG (librsvg w sharp) – przezroczyste tło, rozdzielczość dobrana do docelowego rozmiaru (ostre krawędzie). */
export async function pngZSvg(svg: string, o: OpcjePng = {}): Promise<Buffer> {
  const wejscie = Buffer.from(svg, 'utf8');
  const meta = await sharp(wejscie).metadata();
  const sw = meta.width ?? 100;
  const sh = meta.height ?? 100;
  const docSzer = Math.min(MAKS_BOK_PNG, Math.max(1, Math.round(o.szerokosc ?? (o.wysokosc ? (o.wysokosc * sw) / sh : sw))));
  const docWys = Math.min(MAKS_BOK_PNG, Math.max(1, Math.round(o.wysokosc ?? (docSzer * sh) / sw)));
  // gęstość tak, by librsvg rysował od razu w docelowej rozdzielczości (bez rozmycia przy skalowaniu w górę)
  const gestosc = Math.min(2400, Math.max(1, (72 * Math.max(docSzer / sw, docWys / sh)) * 1.02));
  let obraz = sharp(wejscie, { density: gestosc, limitInputPixels: 80_000_000 }).resize(docSzer, docWys, { fit: 'contain', background: o.tlo ?? { r: 0, g: 0, b: 0, alpha: 0 } });
  if (o.tlo) obraz = obraz.flatten({ background: o.tlo });
  const png = await obraz.png({ compressionLevel: 9 }).toBuffer();
  return o.xmp ? wstawXmpPng(png, o.xmp) : png;
}

/** favicon.ico z obrazów PNG (kwadratowych, ≤ 256 px). */
export function zlozIco(obrazy: { rozmiar: number; png: Buffer }[]): Buffer {
  if (!obrazy.length) throw new Error('ICO bez obrazów.');
  const naglowek = Buffer.alloc(6);
  naglowek.writeUInt16LE(0, 0); // zarezerwowane
  naglowek.writeUInt16LE(1, 2); // typ: 1 = ikona
  naglowek.writeUInt16LE(obrazy.length, 4);
  const wpisy: Buffer[] = [];
  let przesuniecie = 6 + 16 * obrazy.length;
  for (const o of obrazy) {
    if (o.rozmiar < 1 || o.rozmiar > 256) throw new Error('Rozmiar ikony ICO: 1–256 px.');
    const w = Buffer.alloc(16);
    w.writeUInt8(o.rozmiar === 256 ? 0 : o.rozmiar, 0); // szerokość (0 = 256)
    w.writeUInt8(o.rozmiar === 256 ? 0 : o.rozmiar, 1); // wysokość
    w.writeUInt8(0, 2); // liczba kolorów palety (0 = bez palety)
    w.writeUInt8(0, 3); // zarezerwowane
    w.writeUInt16LE(1, 4); // płaszczyzny
    w.writeUInt16LE(32, 6); // bity na piksel
    w.writeUInt32LE(o.png.length, 8);
    w.writeUInt32LE(przesuniecie, 12);
    przesuniecie += o.png.length;
    wpisy.push(w);
  }
  return Buffer.concat([naglowek, ...wpisy, ...obrazy.map((o) => o.png)]);
}

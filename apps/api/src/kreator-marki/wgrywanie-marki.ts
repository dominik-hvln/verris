import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import {
  kolorySzkieletowe,
  pokolorujSygnet,
  porownajWektor,
  walidujSvgSygnetu,
  wektoryzuj,
  wnetrzeSvg,
  wykryjCien,
  wykryjGradient,
  type PomiaryLogo,
} from '@verris/kreator';

/**
 * Kreator marki (paczka 131) – wgrane logo (ścieżki „Mam logo – Key Visual” i „Odświeżenie”): rozpoznanie typu PO
 * ZAWARTOŚCI (nie rozszerzeniu ani Content-Type), pomiary serwera (kolory k-means w OKLab, tło, gradient, cień),
 * sygnet jako wektor:
 *  - SVG → walidujSvgSygnetu w trybie 'wgrany' (ścisły parser, biała lista, wynik budowany od nowa z geometrii);
 *    niczego z pliku klienta nie rasteryzujemy ani nie serwujemy dalej – podgląd to zwalidowany wektor;
 *  - PNG/JPG → sharp (gotowa libvips, bez skryptów; limit pikseli) → piksele RGBA → wektoryzuj + porownajWektor;
 *  - PDF → odrzucony: sharp z gotowych binarek nie renderuje PDF (libvips bez poppler/pdfium), a osobny renderer PDF
 *    to nowa powierzchnia ataku – klient dostaje prośbę o SVG albo PNG.
 */

export type TypWgranego = 'svg' | 'png' | 'jpg' | 'pdf';

export const KOMUNIKAT_PDF = 'Pliki PDF nie są jeszcze obsługiwane – wgraj logo jako SVG albo PNG (najlepiej z przezroczystym tłem).';
export const KOMUNIKAT_TYP = 'Ten plik nie jest obsługiwanym logo – wgraj SVG, PNG albo JPG.';
export const MAKS_PIKSELI_LOGO = 40_000_000;
/** Bok obrazu do pomiarów, wektoryzacji i analizy wizją (koszt tokenów obrazu – koncepcja 2.5). */
export const BOK_ANALIZY = 512;

export class BladWgrania extends Error {
  constructor(
    message: string,
    readonly kod: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

/** Typ po sygnaturze; null = nieobsługiwany. */
export function rozpoznajTypWgranego(buf: Buffer): TypWgranego | null {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  const poczatek = buf.toString('utf8', 0, Math.min(buf.length, 4096)).replace(/^﻿/, '').trimStart();
  if (poczatek.startsWith('<') && /<svg[\s>]/i.test(poczatek)) return 'svg';
  return null;
}

export interface WynikPomiaru {
  pomiary: PomiaryLogo;
  /** Sygnet po walidacji (viewBox 0 0 100 100, kanały currentColor / akcent) albo null. */
  sygnetSvg: string | null;
  /** Zgodność wektora ze źródłem (średnie IoU kolorów, raster) – 0–1. */
  zgodnosc?: number;
  /** Podgląd PNG (≤ 512 px) – do analizy wizją i do panelu („Oryginał”). */
  podglad: Buffer;
  sha256: string;
}

/** Kolory wypełnień z SVG (hex, od najczęstszego) – pomiar dla pliku wektorowego. */
export function koloryZSvg(svg: string): { hex: string; udzial: number }[] {
  const licznik = new Map<string, number>();
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g)) {
    let h = m[1]!.toUpperCase();
    if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
    if (h === '#FFFFFF') continue;
    licznik.set(h, (licznik.get(h) ?? 0) + 1);
  }
  const suma = [...licznik.values()].reduce((s, x) => s + x, 0) || 1;
  return [...licznik.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([hex, n]) => ({ hex, udzial: Math.round((n / suma) * 1000) / 1000 }));
}

/** Sygnet z kanałami pokolorowany kolorami logo (podgląd „Wektor” w panelu). */
export function sygnetWKolorach(sygnetSvg: string, kolory: string[]): string {
  const g = kolory[0] ?? '#1F2937';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${pokolorujSygnet(wnetrzeSvg(sygnetSvg), g, kolory[1] ?? g)}</svg>`;
}

export async function zmierzPlik(buf: Buffer, typ: TypWgranego): Promise<WynikPomiaru> {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (typ === 'pdf') throw new BladWgrania(KOMUNIKAT_PDF, 'PDF_NIEOBSLUGIWANY', 415);
  if (typ === 'svg') {
    const zrodlo = buf.toString('utf8');
    const w = walidujSvgSygnetu(zrodlo, { tryb: 'wgrany' });
    if (!w.ok) throw new BladWgrania(`Tego pliku SVG nie da się użyć: ${w.bledy.slice(0, 3).join(' ')}`, 'SVG_NIEPOPRAWNY');
    const kolory = koloryZSvg(zrodlo);
    const podglad = await sharp(Buffer.from(sygnetWKolorach(w.svg, kolory.map((k) => k.hex))), { density: 400 })
      .resize(BOK_ANALIZY, BOK_ANALIZY, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#FFFFFF' })
      .png()
      .toBuffer();
    return {
      pomiary: { kolory, tlo: null, gradient: /<(linear|radial)Gradient\b/i.test(zrodlo), cien: /<filter\b/i.test(zrodlo), szerokosc: BOK_ANALIZY, wysokosc: BOK_ANALIZY },
      sygnetSvg: w.svg,
      podglad,
      sha256,
    };
  }
  let obraz: { data: Buffer; info: { width: number; height: number } };
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAKS_PIKSELI_LOGO }).metadata();
    obraz = await sharp(buf, { limitInputPixels: MAKS_PIKSELI_LOGO, failOn: 'error' })
      .rotate()
      .resize(BOK_ANALIZY, BOK_ANALIZY, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new BladWgrania('Nie udało się odczytać obrazu – plik jest uszkodzony albo za duży (najwyżej 40 Mpx).', 'OBRAZ_NIECZYTELNY');
  }
  const { width: szer, height: wys } = obraz.info;
  const piksele = new Uint8Array(obraz.data.buffer, obraz.data.byteOffset, obraz.data.length);
  const kol = kolorySzkieletowe(piksele, szer, wys, 5);
  if (!kol.kolory.length) throw new BladWgrania('Na obrazie nie widać logo (sam kolor tła albo pusta przezroczystość).', 'OBRAZ_PUSTY');
  const gradient = wykryjGradient(piksele, szer, wys, kol).gradient;
  const cien = wykryjCien(piksele, szer, wys, kol).cien;
  const kolory = kol.kolory.slice(0, 3).map((k) => k.hex);
  let sygnetSvg: string | null = null;
  let zgodnosc: number | undefined;
  try {
    const wektor = wektoryzuj(piksele, szer, wys, { kolory, tlo: kol.tlo });
    const w = walidujSvgSygnetu(wektor.svg, { tryb: 'wgrany' });
    if (w.ok) {
      sygnetSvg = w.svg;
      const iou = porownajWektor(piksele, szer, wys, wektor, kol.tlo);
      zgodnosc = iou.length ? Math.round((iou.reduce((s, x) => s + x.iou, 0) / iou.length) * 1000) / 1000 : undefined;
    }
  } catch {
    sygnetSvg = null;
  }
  const podglad = await sharp(buf, { limitInputPixels: MAKS_PIKSELI_LOGO }).rotate().resize(BOK_ANALIZY, BOK_ANALIZY, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return {
    pomiary: {
      kolory: kol.kolory.map((k) => ({ hex: k.hex, udzial: k.udzial })),
      tlo: kol.tlo,
      gradient,
      cien,
      szerokosc: meta.width ?? szer,
      wysokosc: meta.height ?? wys,
    },
    sygnetSvg,
    ...(zgodnosc !== undefined ? { zgodnosc } : {}),
    podglad,
    sha256,
  };
}

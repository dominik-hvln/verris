import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { fontkit, osadzCzcionki } from './czcionki.js';
import {
  HANKEN_GROTESK_400,
  HANKEN_GROTESK_600,
  JETBRAINS_MONO_400,
  JETBRAINS_MONO_600,
} from './czcionki-marki.generated.js';

/**
 * Marka Verris w dokumentach PDF — kolory, kroje i znak z `branding/`
 * (03_colors/verris-palette.json, 04_typography/verris-typography.md, 01_logo/verris-lockup-krzywe-*.svg).
 */

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export const KOLORY_MARKI = {
  /** Pine — główny atrament, tła premium. */
  pine: hex('#0C1A14'),
  /** Green — kolor marki. */
  green: hex('#0F7A52'),
  /** Mint — jedyny mocny akcent (na ciemnym tle). */
  mint: hex('#34E5A0'),
  /** Paper — tło jasne, tekst na ciemnym. */
  paper: hex('#F4F4EE'),
  /** Stone — tekst drugorzędny na ciemnym tle. */
  stone: hex('#9AA39C'),
  /**
   * Tekst drugorzędny na białym papierze. Stone z palety ma na bieli kontrast ~2,6:1 (za mało do druku),
   * więc to ten sam odcień przyciemniony do ~5,6:1.
   */
  stoneDruk: hex('#5A6760'),
  /** Linie i ramki na jasnym tle. */
  linia: hex('#D9DCD3'),
  /** Pasek co drugiego wiersza tabeli. */
  pasek: hex('#FAFAF6'),
  bialy: rgb(1, 1, 1),
} as const;

/**
 * Lockup „znak + verris” z verris-lockup-krzywe-jasne.svg (viewBox 18 6 320 78), krzywe — bez czcionki.
 * Znak P3: klin V, którego wcięcie ma ZAWSZE kolor tła (w SVG evenodd); pdf-lib wypełnia regułą
 * nonzero, więc wcięcie rysujemy osobno kolorem tła, a na nim obrys Mint.
 */
const ZNAK = 'M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z';
const WCIECIE = 'M44 55 L56 55 L50 69 Z';
const NAPIS =
  'M132.53 74 116.91 32.87H131.84L140.87 64.14H139.88L148.87 32.87H163.8L148.22 74ZM184.02 75.03Q177.92 75.03 172.88 72.38Q167.83 69.73 164.82 64.88Q161.81 60.02 161.81 53.36Q161.81 46.77 164.74 41.95Q167.68 37.13 172.7 34.49Q177.73 31.84 184.02 31.84Q187.48 31.84 191.04 32.87Q194.6 33.9 197.61 36.52Q200.62 39.15 202.45 43.89Q204.28 48.63 204.28 56.02H170.38V49.02H192.36L191.37 50.88Q191.06 47.3 189.98 45.09Q188.89 42.88 187.27 41.87Q185.65 40.87 183.63 40.87Q180.85 40.87 179.08 42.5Q177.31 44.14 176.47 46.98Q175.64 49.82 175.64 53.43Q175.64 58.88 177.6 62.16Q179.56 65.43 183.9 65.43Q186.57 65.43 188.55 64.04Q190.53 62.65 191.67 59.64L203.55 62.46Q202.11 66.95 199 69.73Q195.9 72.51 191.94 73.77Q187.98 75.03 184.02 75.03ZM208.12 74V32.87H221.11V42.35L220.53 41.06Q222.55 36.33 226.04 34.09Q229.52 31.84 233.86 31.84Q235.08 31.84 236.38 32.03Q237.67 32.22 238.97 32.68L238.09 43.84Q235.46 43.11 233.1 43.11Q230.97 43.11 228.91 43.82Q226.86 44.52 225.18 46.18Q223.5 47.83 222.5 50.73Q221.49 53.62 221.49 58V74ZM240.71 74V32.87H253.7V42.35L253.13 41.06Q255.15 36.33 258.63 34.09Q262.12 31.84 266.46 31.84Q267.68 31.84 268.97 32.03Q270.27 32.22 271.56 32.68L270.69 43.84Q268.06 43.11 265.7 43.11Q263.56 43.11 261.51 43.82Q259.45 44.52 257.78 46.18Q256.1 47.83 255.09 50.73Q254.08 53.62 254.08 58V74ZM274.07 74V32.87H287.44V74ZM280.77 28.75Q276.89 28.75 274.64 26.51Q272.39 24.26 272.39 20.38Q272.39 16.49 274.64 14.24Q276.89 12 280.77 12Q284.66 12 286.91 14.24Q289.15 16.49 289.15 20.38Q289.15 24.26 286.91 26.51Q284.66 28.75 280.77 28.75ZM310.82 75.03Q306.09 75.03 301.77 73.73Q297.45 72.44 294.48 69.62Q291.51 66.8 290.75 62.23L302.59 59.87Q302.9 62.8 304.72 64.33Q306.55 65.85 310.25 65.85Q313.79 65.85 315.35 64.63Q316.91 63.41 316.91 61.81Q316.91 60.4 315.62 59.2Q314.32 58 310.86 57.51L307.58 57.05Q305.33 56.75 302.7 56.18Q300.08 55.6 297.72 54.4Q295.35 53.21 293.87 51.03Q292.38 48.86 292.38 45.36Q292.38 41.25 294.59 38.22Q296.8 35.19 300.84 33.51Q304.88 31.84 310.28 31.84Q314.97 31.84 318.99 33.17Q323 34.5 325.77 37.15Q328.53 39.8 329.33 43.76L317.63 46.16Q317.37 44.9 316.72 43.66Q316.07 42.43 314.68 41.61Q313.29 40.79 310.82 40.79Q308.15 40.79 306.74 41.8Q305.33 42.81 305.33 44.37Q305.33 45.7 306.36 46.52Q307.39 47.34 309.07 47.82Q310.74 48.29 312.68 48.6L316.64 49.17Q319.92 49.62 322.97 50.96Q326.01 52.29 327.97 54.8Q329.94 57.32 329.94 61.39Q329.94 65.89 327.42 68.93Q324.91 71.98 320.57 73.5Q316.23 75.03 310.82 75.03Z';

/** Obrys lockupu w jednostkach SVG (od lewej krawędzi znaku do prawej krawędzi napisu). */
const LOCKUP = { x0: 26, x1: 329.94, y0: 12, y1: 78 };

/** Szerokość lockupu o danej wysokości (pt). */
export function szerokoscLockupu(wysokosc: number): number {
  return ((LOCKUP.x1 - LOCKUP.x0) * wysokosc) / (LOCKUP.y1 - LOCKUP.y0);
}

/**
 * Lockup Verris o wysokości `wysokosc` pt, lewy dolny róg w (x, y).
 * `tlo` — kolor, na którym leży znak (wcięcie klina przyjmuje kolor tła), `kolor` — znak i napis.
 * Zwraca szerokość narysowanego lockupu.
 */
export function rysujLockup(
  page: PDFPage,
  x: number,
  y: number,
  wysokosc: number,
  o: { kolor: RGB; tlo: RGB; akcent?: RGB },
): number {
  const skala = wysokosc / (LOCKUP.y1 - LOCKUP.y0);
  // drawSvgPath: (x, y) to początek układu SVG, oś Y w dół.
  const ox = x - LOCKUP.x0 * skala;
  const oy = y + LOCKUP.y1 * skala;
  page.drawSvgPath(ZNAK, { x: ox, y: oy, scale: skala, color: o.kolor });
  page.drawSvgPath(WCIECIE, { x: ox, y: oy, scale: skala, color: o.tlo });
  page.drawSvgPath(WCIECIE, {
    x: ox,
    y: oy,
    scale: skala,
    borderColor: o.akcent ?? KOLORY_MARKI.mint,
    borderWidth: Math.max(0.35, 1.6 * skala),
  });
  page.drawSvgPath(NAPIS, { x: ox, y: oy, scale: skala, color: o.kolor });
  return szerokoscLockupu(wysokosc);
}

/** Krój faktycznie użyty do tekstu (marka albo zapasowy) — rejestrowany przy osadzeniu, per dokument. */
const ZAPASOWE = new WeakMap<PDFFont, (t: string) => PDFFont>();

/**
 * Krój, którym tekst zostanie NARYSOWANY: dla czcionki marki — zapasowy, gdy w tekście jest znak spoza podzbioru.
 * Pomiar szerokości (wyrównanie do prawej, zawijanie) musi używać tego samego kroju co rysowanie (przegląd 13.10:
 * linie w kroju zapasowym mierzone krojem marki wychodziły poza kolumnę).
 */
export function krojDlaTekstu(font: PDFFont, t: string): PDFFont {
  return ZAPASOWE.get(font)?.(t) ?? font;
}

export interface CzcionkiMarki {
  /** Hanken Grotesk 400 — tekst. */
  tekst: PDFFont;
  /** Hanken Grotesk 600 — etykiety, nagłówki. */
  tekstMocny: PDFFont;
  /** JetBrains Mono 400 — liczby, kwoty, identyfikatory. */
  liczby: PDFFont;
  /** JetBrains Mono 600 — kwoty wyróżnione. */
  liczbyMocne: PDFFont;
  /**
   * Krój zapasowy (DejaVu) dla tekstu, w którym jest znak spoza podzbioru marki — np. „✓”, „✔”.
   * Uwaga: podzbiór DejaVu też jest łaciński (czcionki.generated.ts) — cyrylicy nie ma w żadnym.
   */
  zapasowa(font: PDFFont, t: string): PDFFont;
}

/**
 * `probkaTekstu` — wszystkie zmienne teksty dokumentu (dane z XML-a itp.). DejaVu jest osadzany
 * tylko wtedy, gdy w próbce jest znak spoza podzbioru marki — bez tego każdy PDF niósłby
 * trzy nieużywane kroje.
 */
export async function osadzCzcionkiMarki(pdf: PDFDocument, probkaTekstu: string): Promise<CzcionkiMarki> {
  pdf.registerFontkit(fontkit);
  const [tekst, tekstMocny, liczby, liczbyMocne] = await Promise.all(
    [HANKEN_GROTESK_400, HANKEN_GROTESK_600, JETBRAINS_MONO_400, JETBRAINS_MONO_600].map((b) =>
      pdf.embedFont(Buffer.from(b, 'base64'), { subset: true }),
    ),
  );
  const znaki = new Map<PDFFont, Set<number>>(
    [tekst, tekstMocny, liczby, liczbyMocne].map((f) => [f, new Set(f.getCharacterSet())]),
  );
  const brakuje = (font: PDFFont, t: string): boolean => {
    const z = znaki.get(font);
    if (!z) return false;
    for (const c of t) {
      const kod = c.codePointAt(0)!;
      if (kod >= 0x20 && !z.has(kod)) return true;
    }
    return false;
  };
  const odpowiednik = new Map<PDFFont, PDFFont>();
  if ([tekst, tekstMocny, liczby].some((f) => brakuje(f, probkaTekstu))) {
    const zapas = await osadzCzcionki(pdf);
    odpowiednik.set(tekst, zapas.regular).set(tekstMocny, zapas.bold).set(liczby, zapas.mono).set(liczbyMocne, zapas.mono);
  }
  const zapasowa = (font: PDFFont, t: string) => (brakuje(font, t) ? (odpowiednik.get(font) ?? font) : font);
  for (const f of [tekst, tekstMocny, liczby, liczbyMocne]) ZAPASOWE.set(f, (t) => zapasowa(f, t));
  return { tekst, tekstMocny, liczby, liczbyMocne, zapasowa };
}

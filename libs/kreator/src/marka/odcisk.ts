/**
 * Kreator marki – odcisk znaku do rejestru wydanych znaków (ograniczanie powtórzeń w obrębie Verris, koncepcja 3.6 i 8.4; decyzja 19.11.2026: bez publicznej obietnicy unikalności).
 *
 * Dwa odciski:
 * - `odciskParametrow` – rodzina + parametry skwantowane do 5 przedziałów zakresu (+ litery monogramu): szybkie
 *   porównanie „to ten sam przepis”;
 * - `odciskRastra` – perceptual hash (pHash) renderu 64×64: skala szarości → 32×32 (średnia z bloków) → DCT-II 2D
 *   → 8×8 najniższych częstotliwości → bit = współczynnik > mediana (bez składowej stałej). 64 bity jako 16 znaków hex.
 *   Podobieństwo = 1 − odległość Hamminga / 64. Metoda wg opisu pHash (Zauner, „Implementation and Benchmarking
 *   of Perceptual Image Hash Functions”, 2010) – [do weryfikacji progów na danych z rejestru].
 *
 * `rasteryzujSciezki` – własny rasteryzator scanline (nadpróbkowanie 4×4, evenodd albo nonzero) dla ścieżek SVG
 * w polu viewBox, żeby lib (API i przeglądarka) liczył odcisk bez sharp/canvas.
 */
import type { Sygnet } from './model.ts';
import { rodzinaPoId } from './sygnety/katalog.ts';
import { normalizujLitery } from './sygnety/litery.ts';
import type { Pkt } from './geometria.ts';
import { parsujD, splaszcz } from './sciezka-svg.ts';

export interface OpcjeRastra {
  /** viewBox źródła [x, y, w, h] – domyślnie 0 0 100 100. */
  viewBox?: [number, number, number, number];
  regula?: 'evenodd' | 'nonzero';
  /** Nadpróbkowanie w każdej osi (domyślnie 4). */
  nadprobkowanie?: number;
}

/**
 * Rasteryzuje ścieżki (`d`) do bitmapy rozmiar×rozmiar w skali szarości (0 = tło, 255 = pełne pokrycie).
 * Każda ścieżka wypełniana osobno wg reguły, wyniki sumowane (suma zbiorów – jak nakładające się `<path>`).
 * Ścieżki z błędem składni są pomijane.
 */
export function rasteryzujSciezki(d: string[], rozmiar: number, o: OpcjeRastra = {}): Uint8Array {
  const [vx, vy, vw, vh] = o.viewBox ?? [0, 0, 100, 100];
  const ss = o.nadprobkowanie ?? 4;
  const R = rozmiar * ss;
  const sx = R / vw;
  const sy = R / vh;
  const maska = new Uint8Array(R * R);
  const nonzero = o.regula === 'nonzero';
  for (const sciezka of d) {
    const seg = parsujD(sciezka);
    if (!seg) continue;
    const polilinie = splaszcz(seg, 0.25 / Math.max(sx, sy));
    // krawędzie w pikselach nadpróbkowanych
    const kr: { x0: number; y0: number; x1: number; y1: number; kier: number }[] = [];
    for (const pl of polilinie) {
      const n = pl.length;
      for (let i = 0; i < n; i++) {
        const a: Pkt = pl[i];
        const b: Pkt = pl[(i + 1) % n];
        const ax = (a[0] - vx) * sx;
        const ay = (a[1] - vy) * sy;
        const bx = (b[0] - vx) * sx;
        const by = (b[1] - vy) * sy;
        if (ay === by) continue;
        kr.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, kier: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, kier: -1 });
      }
    }
    const przeciecia: { x: number; k: number }[] = [];
    for (let row = 0; row < R; row++) {
      const y = row + 0.5;
      przeciecia.length = 0;
      for (const e of kr) {
        if (y < e.y0 || y >= e.y1) continue;
        przeciecia.push({ x: e.x0 + ((y - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0), k: e.kier });
      }
      if (przeciecia.length < 2) continue;
      przeciecia.sort((p, q) => p.x - q.x);
      let w = 0;
      for (let i = 0; i < przeciecia.length - 1; i++) {
        w = nonzero ? w + przeciecia[i].k : w ^ 1;
        if (w === 0) continue;
        const xa = Math.max(0, Math.ceil(przeciecia[i].x - 0.5));
        const xb = Math.min(R - 1, Math.floor(przeciecia[i + 1].x - 0.5));
        for (let x = xa; x <= xb; x++) maska[row * R + x] = 1;
      }
    }
  }
  const wyn = new Uint8Array(rozmiar * rozmiar);
  const dziel = ss * ss;
  for (let y = 0; y < rozmiar; y++)
    for (let x = 0; x < rozmiar; x++) {
      let s = 0;
      for (let j = 0; j < ss; j++) {
        const o2 = (y * ss + j) * R + x * ss;
        for (let i = 0; i < ss; i++) s += maska[o2 + i];
      }
      wyn[y * rozmiar + x] = Math.round((s * 255) / dziel);
    }
  return wyn;
}

/** Wyciąga wartości `d` wszystkich `<path>` z SVG (tylko do odcisku – SVG z naszego renderu albo walidatora). */
export function sciezkiZSvg(svg: string): string[] {
  const wyn: string[] = [];
  const re = /<path\b[^>]*?\sd="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) wyn.push(m[1]);
  return wyn;
}

function dct1d(N: number): Float64Array {
  // macierz DCT-II: c[k][n] = cos(pi (n + 0.5) k / N)
  const c = new Float64Array(N * N);
  for (let k = 0; k < N; k++) for (let n = 0; n < N; n++) c[k * N + n] = Math.cos((Math.PI * (n + 0.5) * k) / N);
  return c;
}
const DCT32 = dct1d(32);

/** pHash 64-bit jako 16 znaków hex z bitmapy w skali szarości (wartość = „tusz”, 0–255). */
export function odciskRastra(piksele: Uint8Array, szer: number, wys: number): string {
  const N = 32;
  const m = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const x0 = Math.floor((x * szer) / N);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * szer) / N));
      const y0 = Math.floor((y * wys) / N);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * wys) / N));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += piksele[yy * szer + xx] ?? 0;
      m[y * N + x] = s / ((x1 - x0) * (y1 - y0));
    }
  // DCT tylko 8×8 najniższych współczynników
  const tmp = new Float64Array(8 * N);
  for (let k = 0; k < 8; k++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += DCT32[k * N + y] * m[y * N + x];
      tmp[k * N + x] = s;
    }
  const wsp: number[] = [];
  for (let k = 0; k < 8; k++)
    for (let l = 0; l < 8; l++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += DCT32[l * N + x] * tmp[k * N + x];
      wsp.push(s);
    }
  const bezStalej = wsp.slice(1).sort((a, b) => a - b);
  const mediana = (bezStalej[31] + bezStalej[32]) / 2;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) nib = (nib << 1) | (wsp[i + j] > mediana ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}

/** Odległość Hamminga dwóch odcisków hex (64 bity). */
export function odlegloscHamminga(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Podobieństwo 0–1 (1 = identyczne odciski). */
export function podobienstwo(a: string, b: string): number {
  return 1 - odlegloscHamminga(a, b) / 64;
}

/**
 * Odcisk parametrów sygnetu z biblioteki: `rodzina|klucz=przedział;…|litery` (przedział 0–4 = piąta część zakresu).
 * Dla symbolu od AI / wgranego i marki bez znaku – null (porównujemy wtedy tylko odcisk rastra).
 */
export function odciskParametrow(sygnet: Sygnet): string | null {
  if (sygnet.typ !== 'biblioteka') return null;
  const r = rodzinaPoId(sygnet.rodzina);
  const czesci: string[] = [];
  if (r) {
    for (const p of r.parametry) {
      const v = Math.min(p.max, Math.max(p.min, sygnet.parametry[p.klucz] ?? p.domyslna));
      const zakres = p.max - p.min;
      const q = zakres <= 4 ? v - p.min : Math.min(4, Math.floor(((v - p.min) / zakres) * 5));
      czesci.push(`${p.klucz}=${q}`);
    }
  } else {
    for (const k of Object.keys(sygnet.parametry).sort()) czesci.push(`${k}=${sygnet.parametry[k]}`);
  }
  const lit = r?.monogram ? normalizujLitery(sygnet.litery, 2).join('') : '';
  return `${sygnet.rodzina}|${czesci.join(';')}|${lit}`;
}

/** Odcisk rastra znaku zapisanego jako SVG z samymi `<path>` w viewBox 0 0 100 100. */
export function odciskSvg(svg: string): string {
  return odciskRastra(rasteryzujSciezki(sciezkiZSvg(svg), 64), 64, 64);
}

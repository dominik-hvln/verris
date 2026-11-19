/**
 * Kreator marki – parser i normalizacja `d` ścieżek SVG (bez zależności). Używają go walidator SVG (symbole od AI
 * i pliki wgrane), rasteryzator odcisku znaku i wzór. Wynik normalizacji: tylko polecenia bezwzględne M, L, C, Z
 * (łuki A zamienione na krzywe Béziera, H/V/S/Q/T rozwinięte), co pozwala bezpiecznie zastosować przekształcenie
 * afiniczne (spłaszczenie `transform`) i policzyć granice.
 *
 * Gramatyka: SVG 1.1 / SVG 2 „Path data” – https://www.w3.org/TR/SVG2/paths.html#PathDataBNF (flagi łuku mogą być
 * sklejone: „a1 1 0 01 10 10”). Błąd składni = null (wywołujący odrzuca plik), bez prób „naprawy”.
 */
import type { Pkt } from './geometria.ts';

export type Segment =
  | { t: 'M'; p: Pkt }
  | { t: 'L'; p: Pkt }
  | { t: 'C'; c1: Pkt; c2: Pkt; p: Pkt }
  | { t: 'Z' };

/** Macierz afiniczna [a b c d e f] jak w SVG: x' = a x + c y + e, y' = b x + d y + f. */
export type Macierz = [number, number, number, number, number, number];
export const JEDNOSTKOWA: Macierz = [1, 0, 0, 1, 0, 0];

export function zlozMacierze(m: Macierz, n: Macierz): Macierz {
  // m × n (najpierw n, potem m)
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function zastosuj(m: Macierz, [x, y]: Pkt): Pkt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const LICZBA = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const POLECENIA = 'MmLlHhVvCcSsQqTtAaZz';
const ILE_ARG: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Parsuje `d` do segmentów bezwzględnych M/L/C/Z. Zwraca null przy błędzie składni albo liczbach nieskończonych. */
export function parsujD(d: string, maksSegmentow = 20_000): Segment[] | null {
  const s = d;
  let i = 0;
  const wyn: Segment[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let ostC2: Pkt | null = null;
  let ostQ: Pkt | null = null;
  let pol = '';
  const pomin = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  const czytajLiczbe = (): number | null => {
    pomin();
    const m = LICZBA.exec(s.slice(i, i + 40));
    if (!m) return null;
    i += m[0].length;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : null;
  };
  const czytajFlage = (): number | null => {
    pomin();
    if (s[i] === '0' || s[i] === '1') return Number(s[i++]);
    return null;
  };
  pomin();
  if (i < s.length && s[i] !== 'M' && s[i] !== 'm') return null;
  while (true) {
    pomin();
    if (i >= s.length) break;
    if (POLECENIA.includes(s[i])) pol = s[i++];
    else if (!pol || pol === 'Z' || pol === 'z') return null;
    const wzgl = pol === pol.toLowerCase();
    const P = pol.toUpperCase();
    if (P === 'Z') {
      wyn.push({ t: 'Z' });
      cx = sx;
      cy = sy;
      ostC2 = ostQ = null;
      continue;
    }
    const n = ILE_ARG[P];
    const a: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = P === 'A' && (k === 3 || k === 4) ? czytajFlage() : czytajLiczbe();
      if (v === null) return null;
      a.push(v);
    }
    const ox = wzgl ? cx : 0;
    const oy = wzgl ? cy : 0;
    switch (P) {
      case 'M': {
        cx = a[0] + ox;
        cy = a[1] + oy;
        sx = cx;
        sy = cy;
        wyn.push({ t: 'M', p: [cx, cy] });
        pol = wzgl ? 'l' : 'L';
        ostC2 = ostQ = null;
        break;
      }
      case 'L':
        cx = a[0] + ox;
        cy = a[1] + oy;
        wyn.push({ t: 'L', p: [cx, cy] });
        ostC2 = ostQ = null;
        break;
      case 'H':
        cx = a[0] + (wzgl ? cx : 0);
        wyn.push({ t: 'L', p: [cx, cy] });
        ostC2 = ostQ = null;
        break;
      case 'V':
        cy = a[0] + (wzgl ? cy : 0);
        wyn.push({ t: 'L', p: [cx, cy] });
        ostC2 = ostQ = null;
        break;
      case 'C': {
        const c1: Pkt = [a[0] + ox, a[1] + oy];
        const c2: Pkt = [a[2] + ox, a[3] + oy];
        const p: Pkt = [a[4] + ox, a[5] + oy];
        wyn.push({ t: 'C', c1, c2, p });
        ostC2 = c2;
        ostQ = null;
        [cx, cy] = p;
        break;
      }
      case 'S': {
        const c1: Pkt = ostC2 ? [2 * cx - ostC2[0], 2 * cy - ostC2[1]] : [cx, cy];
        const c2: Pkt = [a[0] + ox, a[1] + oy];
        const p: Pkt = [a[2] + ox, a[3] + oy];
        wyn.push({ t: 'C', c1, c2, p });
        ostC2 = c2;
        ostQ = null;
        [cx, cy] = p;
        break;
      }
      case 'Q':
      case 'T': {
        const q: Pkt =
          P === 'Q' ? [a[0] + ox, a[1] + oy] : ostQ ? [2 * cx - ostQ[0], 2 * cy - ostQ[1]] : [cx, cy];
        const p: Pkt = P === 'Q' ? [a[2] + ox, a[3] + oy] : [a[0] + ox, a[1] + oy];
        wyn.push({
          t: 'C',
          c1: [cx + (2 / 3) * (q[0] - cx), cy + (2 / 3) * (q[1] - cy)],
          c2: [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])],
          p,
        });
        ostQ = q;
        ostC2 = null;
        [cx, cy] = p;
        break;
      }
      case 'A': {
        const p: Pkt = [a[5] + ox, a[6] + oy];
        for (const seg of lukDoBeziera([cx, cy], a[0], a[1], a[2], a[3], a[4], p)) wyn.push(seg);
        [cx, cy] = p;
        ostC2 = ostQ = null;
        break;
      }
    }
    if (wyn.length > maksSegmentow) return null;
  }
  return wyn;
}

/** Łuk eliptyczny (parametryzacja końcowa) → krzywe Béziera; wg SVG 2, dodatek B.2.4 (konwersja do środka). */
function lukDoBeziera(p0: Pkt, rx0: number, ry0: number, obrSt: number, duzy: number, kier: number, p1: Pkt): Segment[] {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx < 1e-9 || ry < 1e-9 || (p0[0] === p1[0] && p0[1] === p1[1])) return [{ t: 'L', p: p1 }];
  const phi = (obrSt * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const lic = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const mian = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, lic / mian));
  if (duzy === kier) k = -k;
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const kat = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = kat(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = kat((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!kier && dt > 0) dt -= 2 * Math.PI;
  else if (kier && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const krok = dt / n;
  const al = (4 / 3) * Math.tan(krok / 4);
  const pkt = (t: number): Pkt => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const poch = (t: number): Pkt => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const wyn: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const ta = t1 + i * krok;
    const tb = ta + krok;
    const a = pkt(ta);
    const b = i === n - 1 ? p1 : pkt(tb);
    const da = poch(ta);
    const db = poch(tb);
    wyn.push({ t: 'C', c1: [a[0] + al * da[0], a[1] + al * da[1]], c2: [b[0] - al * db[0], b[1] - al * db[1]], p: b });
  }
  return wyn;
}

export function przeksztalcSegmenty(seg: Segment[], m: Macierz): Segment[] {
  return seg.map((s) => {
    if (s.t === 'Z') return s;
    if (s.t === 'C') return { t: 'C', c1: zastosuj(m, s.c1), c2: zastosuj(m, s.c2), p: zastosuj(m, s.p) };
    return { t: s.t, p: zastosuj(m, s.p) };
  });
}

const fmt = (x: number, cyfry: number) => {
  const m = 10 ** cyfry;
  const s = String(Math.round(x * m) / m);
  return s === '-0' ? '0' : s;
};

/** Zapis segmentów do `d` (bezwzględne M/L/C/Z, liczby zaokrąglone). */
export function segmentyDoD(seg: Segment[], cyfry = 2): string {
  const f = (p: Pkt) => fmt(p[0], cyfry) + ' ' + fmt(p[1], cyfry);
  return seg
    .map((s) => (s.t === 'Z' ? 'Z' : s.t === 'C' ? `C${f(s.c1)} ${f(s.c2)} ${f(s.p)}` : `${s.t}${f(s.p)}`))
    .join('');
}

/** Spłaszcza segmenty do polilinii (podścieżki; zamknięte i otwarte traktujemy jak zamknięte – wypełnienie). */
export function splaszcz(seg: Segment[], tol = 0.05): Pkt[][] {
  return splaszczPodsciezki(seg, tol).map((p) => p.pts);
}

/** Jak `splaszcz`, ale z informacją, czy podścieżka była zamknięta (Z) – potrzebne do obrysu. */
export function splaszczPodsciezki(seg: Segment[], tol = 0.05): { pts: Pkt[]; zamknieta: boolean }[] {
  const wyn: { pts: Pkt[]; zamknieta: boolean }[] = [];
  let cur: Pkt[] = [];
  let poz: Pkt = [0, 0];
  const zamknij = (z = false) => {
    if (cur.length > 1) wyn.push({ pts: cur, zamknieta: z });
    cur = [];
  };
  for (const s of seg) {
    if (s.t === 'M') {
      zamknij();
      cur = [s.p];
      poz = s.p;
    } else if (s.t === 'L') {
      if (!cur.length) cur = [poz];
      cur.push(s.p);
      poz = s.p;
    } else if (s.t === 'C') {
      if (!cur.length) cur = [poz];
      const p0 = poz;
      const dlug = Math.hypot(s.c1[0] - p0[0], s.c1[1] - p0[1]) + Math.hypot(s.c2[0] - s.c1[0], s.c2[1] - s.c1[1]) +
        Math.hypot(s.p[0] - s.c2[0], s.p[1] - s.c2[1]);
      const n = Math.min(256, Math.max(2, Math.ceil(Math.sqrt(dlug / tol) * 0.6)));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        cur.push([
          u * u * u * p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p[0],
          u * u * u * p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p[1],
        ]);
      }
      poz = s.p;
    } else {
      if (cur.length) poz = cur[0];
      zamknij(true);
    }
  }
  zamknij();
  return wyn;
}

/** Granice segmentów (z punktami kontrolnymi – górne oszacowanie). */
export function graniceSegmentow(seg: Segment[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const dodaj = ([x, y]: Pkt) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const s of seg) {
    if (s.t === 'Z') continue;
    if (s.t === 'C') {
      dodaj(s.c1);
      dodaj(s.c2);
    }
    dodaj(s.p);
  }
  return { x0, y0, x1, y1 };
}

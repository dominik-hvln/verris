import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  appendBezierCurve,
  clip,
  clipEvenOdd,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  type PDFPage,
  LineCapStyle,
  LineJoinStyle,
} from 'pdf-lib';
import { parsujDSciezki, type MacierzSvg, type SegmentSciezki } from '@verris/kreator';

/**
 * Kreator marki (paczka 131) – rysowanie SVG z biblioteki marki do PDF jako WEKTOR (pdf-lib, MIT): ścieżki, prostokąty,
 * koła, linie, zagnieżdżone `<svg>` z viewBox, `<g transform>`, wzór (`<pattern>` – kafle przycięte do kształtu),
 * przezroczystość (ExtGState), przerywane linie cięcia. Napisy muszą być wcześniej zamienione na krzywe
 * (NapisMarkiService.tekstNaKrzywe) – pozostałe `<text>` są pomijane. Elementów, których PDF wektorowo tu nie
 * obsługuje (filtr cienia, zdjęcie, gradient), wywołujący nie podaje tą drogą – `wymagaRastra` mówi, kiedy użyć PNG.
 *
 * SVG pochodzi wyłącznie z naszej biblioteki (szablony marki), nie od klienta – parser obsługuje ten podzbiór.
 * Kolory w RGB (DeviceRGB); odpowiedniki CMYK opisujemy w treści dokumentu (orientacyjnie – drukarnia przelicza
 * swoim profilem).
 */

export interface WezelXml {
  nazwa: string;
  atr: Record<string, string>;
  dzieci: WezelXml[];
}

const ENCJE: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const odkoduj = (t: string) =>
  t.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (c, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENCJE[e] ?? c),
  );

/** Prosty parser XML dla SVG z biblioteki (bez DOCTYPE, CDATA i instrukcji – te pomija). */
export function parsujSvg(svg: string): WezelXml | null {
  const korzen: WezelXml = { nazwa: '#', atr: {}, dzieci: [] };
  const stos: WezelXml[] = [korzen];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    if (!m[2]) continue;
    const [, zamykajacy, nazwa, atrybuty, samozamkniety] = m;
    if (zamykajacy) {
      if (stos.length > 1 && stos[stos.length - 1]!.nazwa === nazwa) stos.pop();
      continue;
    }
    const atr: Record<string, string> = {};
    for (const a of atrybuty!.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) atr[a[1]!] = odkoduj(a[2] ?? a[3] ?? '');
    const w: WezelXml = { nazwa: nazwa!, atr, dzieci: [] };
    stos[stos.length - 1]!.dzieci.push(w);
    if (!samozamkniety) stos.push(w);
  }
  return korzen.dzieci.find((d) => d.nazwa === 'svg') ?? null;
}

/** SVG z elementami, których ten renderer nie rysuje wektorowo (wywołujący osadza wtedy PNG). */
export function wymagaRastra(svg: string): boolean {
  return /<(filter|image|mask|radialGradient)\b/.test(svg) || /fill="url\(#[^)]*-g\)"/.test(svg) || /<linearGradient\b/.test(svg);
}

type M = MacierzSvg;
const mnoz = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const pkt = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const liczba = (v: string | undefined, dom = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : dom;
};

/** `transform` SVG (translate, scale, rotate, matrix) → macierz. */
export function macierzTransformacji(t: string | undefined): M {
  let m: M = [1, 0, 0, 1, 0, 0];
  if (!t) return m;
  for (const [, f, a] of t.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const v = a!.split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = [1, 0, 0, 1, 0, 0];
    if (f === 'matrix' && v.length === 6) n = v as M;
    else if (f === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (f === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (f === 'rotate') {
      const r = ((v[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      n = mnoz(mnoz([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
    m = mnoz(m, n);
  }
  return m;
}

const NAZWY_KOLOROW: Record<string, string> = { black: '#000000', white: '#FFFFFF' };

/** Kolor → RGB 0–1 albo null (none, url(...) obsługiwane osobno). */
export function rgb(kolor: string | undefined, biezacy = '#000000'): [number, number, number] | null {
  if (!kolor || kolor === 'none' || kolor.startsWith('url(')) return null;
  let k = kolor.trim();
  if (k === 'currentColor') k = biezacy;
  k = NAZWY_KOLOROW[k.toLowerCase()] ?? k;
  if (/^#[0-9a-fA-F]{3}$/.test(k)) k = `#${k[1]}${k[1]}${k[2]}${k[2]}${k[3]}${k[3]}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(k)) return null;
  const n = parseInt(k.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Styl {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: 'nonzero' | 'evenodd';
  opacity: number;
  fillOpacity: number;
  color: string;
  dash: number[] | null;
  linecap: string;
}

const STYL_POCZATKOWY: Styl = { fill: '#000000', stroke: 'none', strokeWidth: 1, fillRule: 'nonzero', opacity: 1, fillOpacity: 1, color: '#000000', dash: null, linecap: 'butt' };

function stylWezla(w: WezelXml, s: Styl): Styl {
  const a = w.atr;
  return {
    fill: a.fill ?? s.fill,
    stroke: a.stroke ?? s.stroke,
    strokeWidth: a['stroke-width'] !== undefined ? liczba(a['stroke-width'], 1) : s.strokeWidth,
    fillRule: a['fill-rule'] === 'evenodd' ? 'evenodd' : a['fill-rule'] === 'nonzero' ? 'nonzero' : s.fillRule,
    opacity: s.opacity * (a.opacity !== undefined ? liczba(a.opacity, 1) : 1),
    fillOpacity: a['fill-opacity'] !== undefined ? liczba(a['fill-opacity'], 1) : s.fillOpacity,
    color: a.color ?? s.color,
    dash: a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x)) : s.dash,
    linecap: a['stroke-linecap'] ?? s.linecap,
  };
}

/** Kształt elementu jako segmenty M/L/C/Z we współrzędnych użytkownika. */
export function segmentyElementu(w: WezelXml): SegmentSciezki[] | null {
  const a = w.atr;
  const k = 0.5522847498;
  const elipsa = (cx: number, cy: number, rx: number, ry: number): SegmentSciezki[] => [
    { t: 'M', p: [cx + rx, cy] },
    { t: 'C', c1: [cx + rx, cy + k * ry], c2: [cx + k * rx, cy + ry], p: [cx, cy + ry] },
    { t: 'C', c1: [cx - k * rx, cy + ry], c2: [cx - rx, cy + k * ry], p: [cx - rx, cy] },
    { t: 'C', c1: [cx - rx, cy - k * ry], c2: [cx - k * rx, cy - ry], p: [cx, cy - ry] },
    { t: 'C', c1: [cx + k * rx, cy - ry], c2: [cx + rx, cy - k * ry], p: [cx + rx, cy] },
    { t: 'Z' },
  ];
  switch (w.nazwa) {
    case 'path':
      return a.d ? parsujDSciezki(a.d) : null;
    case 'rect': {
      const x = liczba(a.x);
      const y = liczba(a.y);
      const wd = liczba(a.width);
      const h = liczba(a.height);
      if (wd <= 0 || h <= 0) return null;
      const rx = Math.min(wd / 2, liczba(a.rx, liczba(a.ry)));
      const ry = Math.min(h / 2, liczba(a.ry, rx));
      if (rx <= 0) return [{ t: 'M', p: [x, y] }, { t: 'L', p: [x + wd, y] }, { t: 'L', p: [x + wd, y + h] }, { t: 'L', p: [x, y + h] }, { t: 'Z' }];
      return [
        { t: 'M', p: [x + rx, y] },
        { t: 'L', p: [x + wd - rx, y] },
        { t: 'C', c1: [x + wd - rx + k * rx, y], c2: [x + wd, y + ry - k * ry], p: [x + wd, y + ry] },
        { t: 'L', p: [x + wd, y + h - ry] },
        { t: 'C', c1: [x + wd, y + h - ry + k * ry], c2: [x + wd - rx + k * rx, y + h], p: [x + wd - rx, y + h] },
        { t: 'L', p: [x + rx, y + h] },
        { t: 'C', c1: [x + rx - k * rx, y + h], c2: [x, y + h - ry + k * ry], p: [x, y + h - ry] },
        { t: 'L', p: [x, y + ry] },
        { t: 'C', c1: [x, y + ry - k * ry], c2: [x + rx - k * rx, y], p: [x + rx, y] },
        { t: 'Z' },
      ];
    }
    case 'circle':
      return liczba(a.r) > 0 ? elipsa(liczba(a.cx), liczba(a.cy), liczba(a.r), liczba(a.r)) : null;
    case 'ellipse':
      return liczba(a.rx) > 0 && liczba(a.ry) > 0 ? elipsa(liczba(a.cx), liczba(a.cy), liczba(a.rx), liczba(a.ry)) : null;
    case 'line':
      return [{ t: 'M', p: [liczba(a.x1), liczba(a.y1)] }, { t: 'L', p: [liczba(a.x2), liczba(a.y2)] }];
    case 'polygon':
    case 'polyline': {
      const v = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      if (v.length < 4) return null;
      const s: SegmentSciezki[] = [{ t: 'M', p: [v[0]!, v[1]!] }];
      for (let i = 2; i + 1 < v.length; i += 2) s.push({ t: 'L', p: [v[i]!, v[i + 1]!] });
      if (w.nazwa === 'polygon') s.push({ t: 'Z' });
      return s;
    }
    default:
      return null;
  }
}

function granice(seg: SegmentSciezki[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of seg) {
    if (s.t === 'Z') continue;
    for (const p of s.t === 'C' ? [s.c1, s.c2, s.p] : [s.p]) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
  }
  return [x0, y0, x1, y1];
}

/** Macierz zagnieżdżonego `<svg>` (x, y, width, height, viewBox, preserveAspectRatio). */
export function macierzSvg(a: Record<string, string>, domSzer: number, domWys: number): M {
  const x = liczba(a.x);
  const y = liczba(a.y);
  const w = liczba(a.width, domSzer);
  const h = liczba(a.height, domWys);
  const vb = (a.viewBox ?? '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2]! <= 0 || vb[3]! <= 0) return [1, 0, 0, 1, x, y];
  const sx = w / vb[2]!;
  const sy = h / vb[3]!;
  if (a.preserveAspectRatio === 'none') return [sx, 0, 0, sy, x - vb[0]! * sx, y - vb[1]! * sy];
  const s = Math.min(sx, sy);
  const dx = (w - vb[2]! * s) / 2;
  const dy = (h - vb[3]! * s) / 2;
  return [s, 0, 0, s, x + dx - vb[0]! * s, y + dy - vb[1]! * s];
}

const FILL_EVEN_ODD = () => PDFOperator.of(PDFOperatorNames.FillEvenOdd);

/** Rysuje drzewo SVG na stronie PDF. `doStrony` = macierz z jednostek korzenia SVG do punktów PDF (z odwróceniem osi Y). */
export class RysownikPdf {
  private readonly ops: PDFOperator[] = [];
  private readonly definicje = new Map<string, WezelXml>();
  private readonly stany = new Map<number, string>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly page: PDFPage,
  ) {}

  rysuj(korzen: WezelXml, doStrony: M): void {
    this.zbierzDefinicje(korzen);
    this.wezel(korzen, doStrony, STYL_POCZATKOWY, true);
    this.page.pushOperators(...this.ops);
    this.ops.length = 0;
  }

  private zbierzDefinicje(w: WezelXml): void {
    if (w.atr.id) this.definicje.set(w.atr.id, w);
    for (const d of w.dzieci) this.zbierzDefinicje(d);
  }

  private stanPrzezroczystosci(alfa: number): string {
    const klucz = Math.round(alfa * 1000);
    let nazwa = this.stany.get(klucz);
    if (!nazwa) {
      nazwa = `GSv${klucz}`;
      const dict = this.doc.context.obj({ Type: 'ExtGState', ca: klucz / 1000, CA: klucz / 1000 });
      const ref = this.doc.context.register(dict);
      this.page.node.setExtGState(PDFName.of(nazwa), ref);
      this.stany.set(klucz, nazwa);
    }
    return nazwa;
  }

  private sciezka(seg: SegmentSciezki[], m: M): void {
    for (const s of seg) {
      if (s.t === 'Z') this.ops.push(closePath());
      else if (s.t === 'M') this.ops.push(moveTo(...pkt(m, s.p[0], s.p[1])));
      else if (s.t === 'L') this.ops.push(lineTo(...pkt(m, s.p[0], s.p[1])));
      else this.ops.push(appendBezierCurve(...pkt(m, s.c1[0], s.c1[1]), ...pkt(m, s.c2[0], s.c2[1]), ...pkt(m, s.p[0], s.p[1])));
    }
  }

  private wezel(w: WezelXml, m: M, rodzic: Styl, korzen = false): void {
    if (['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'pattern', 'linearGradient', 'radialGradient', 'filter', 'text', 'image', 'mask'].includes(w.nazwa)) return;
    const s = stylWezla(w, rodzic);
    let mm = mnoz(m, macierzTransformacji(w.atr.transform));
    if (w.nazwa === 'svg') {
      if (!korzen) mm = mnoz(mm, macierzSvg(w.atr, 0, 0));
      for (const d of w.dzieci) this.wezel(d, mm, s);
      return;
    }
    if (w.nazwa === 'g') {
      const klip = /^url\(#([^)]+)\)$/.exec(w.atr['clip-path'] ?? '')?.[1];
      const kp = klip ? this.definicje.get(klip) : undefined;
      if (kp) {
        this.ops.push(pushGraphicsState());
        for (const d of kp.dzieci) {
          const seg = segmentyElementu(d);
          if (seg) this.sciezka(seg, mnoz(mm, macierzTransformacji(d.atr.transform)));
        }
        this.ops.push(clip(), endPath());
      }
      for (const d of w.dzieci) this.wezel(d, mm, s);
      if (kp) this.ops.push(popGraphicsState());
      return;
    }
    const seg = segmentyElementu(w);
    if (!seg || !seg.length) return;
    // wypełnienie wzorem: kafle przycięte do kształtu
    const wzor = /^url\(#([^)]+)\)$/.exec(s.fill)?.[1];
    const pattern = wzor ? this.definicje.get(wzor) : undefined;
    if (pattern?.nazwa === 'pattern') {
      this.wzor(seg, mm, pattern, s);
      return;
    }
    const kolorWyp = rgb(s.fill, s.color);
    const kolorObr = rgb(s.stroke, s.color);
    if (!kolorWyp && !kolorObr) return;
    const alfaWyp = s.opacity * s.fillOpacity;
    if (kolorWyp && alfaWyp > 0) {
      this.ops.push(pushGraphicsState());
      if (alfaWyp < 1) this.ops.push(setGraphicsState(this.stanPrzezroczystosci(alfaWyp)));
      this.ops.push(setFillingRgbColor(...kolorWyp));
      this.sciezka(seg, mm);
      this.ops.push(s.fillRule === 'evenodd' ? FILL_EVEN_ODD() : fill());
      this.ops.push(popGraphicsState());
    }
    if (kolorObr && s.strokeWidth > 0 && s.opacity > 0) {
      const skala = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2]));
      this.ops.push(pushGraphicsState());
      if (s.opacity < 1) this.ops.push(setGraphicsState(this.stanPrzezroczystosci(s.opacity)));
      this.ops.push(setStrokingRgbColor(...kolorObr), setLineWidth(s.strokeWidth * skala));
      this.ops.push(setLineCap(s.linecap === 'round' ? LineCapStyle.Round : s.linecap === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt));
      this.ops.push(setLineJoin(LineJoinStyle.Miter));
      if (s.dash?.length) this.ops.push(setDashPattern(s.dash.map((d) => d * skala), 0));
      this.sciezka(seg, mm);
      this.ops.push(stroke());
      this.ops.push(popGraphicsState());
    }
  }

  private wzor(seg: SegmentSciezki[], m: M, p: WezelXml, s: Styl): void {
    const w = liczba(p.atr.width);
    const h = liczba(p.atr.height);
    if (w <= 0 || h <= 0) return;
    const [x0, y0, x1, y1] = granice(seg);
    const px = liczba(p.atr.x);
    const py = liczba(p.atr.y);
    const iMax = Math.ceil((x1 - px) / w);
    const jMax = Math.ceil((y1 - py) / h);
    if ((iMax - Math.floor((x0 - px) / w)) * (jMax - Math.floor((y0 - py) / h)) > 4000) return; // zabezpieczenie
    this.ops.push(pushGraphicsState());
    this.sciezka(seg, m);
    this.ops.push(s.fillRule === 'evenodd' ? clipEvenOdd() : clip(), endPath());
    const pm = mnoz(m, macierzTransformacji(p.atr.patternTransform));
    for (let i = Math.floor((x0 - px) / w); i < iMax; i++) {
      for (let j = Math.floor((y0 - py) / h); j < jMax; j++) {
        const kafel = mnoz(pm, [1, 0, 0, 1, px + i * w, py + j * h]);
        for (const d of p.dzieci) this.wezel(d, kafel, { ...STYL_POCZATKOWY, opacity: s.opacity });
      }
    }
    this.ops.push(popGraphicsState());
  }
}

export const MM_NA_PT = 72 / 25.4;

/**
 * Strona PDF z SVG (korzeń z viewBox w jednostkach `jednostka`): rozmiar strony = viewBox × skala jednostki.
 * Zwraca stronę (do dopisania tekstu/opisu przez wywołującego).
 */
export function stronaZSvg(doc: PDFDocument, svg: string, jednostka: 'mm' | 'px'): PDFPage {
  const korzen = parsujSvg(svg);
  if (!korzen) throw new Error('Nieprawidłowy SVG materiału.');
  const vb = (korzen.atr.viewBox ?? '').split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb.length === 4 && vb.every((v) => Number.isFinite(v)) ? vb : [0, 0, liczba(korzen.atr.width, 100), liczba(korzen.atr.height, 100)];
  const k = jednostka === 'mm' ? MM_NA_PT : 0.75;
  const page = doc.addPage([vw! * k, vh! * k]);
  new RysownikPdf(doc, page).rysuj(korzen, [k, 0, 0, -k, -vx! * k, (vh! + vy!) * k]);
  return page;
}

/** Rysuje SVG w prostokącie strony (mm, y od góry strony) – bloki księgi znaku. */
export function svgWProstokacie(doc: PDFDocument, page: PDFPage, svg: string, x: number, y: number, w: number, h: number): void {
  const korzen = parsujSvg(svg);
  if (!korzen) return;
  const wys = page.getHeight();
  const doStrony: M = [MM_NA_PT, 0, 0, -MM_NA_PT, 0, wys];
  const m = mnoz(doStrony, macierzSvg({ ...korzen.atr, x: String(x), y: String(y), width: String(w), height: String(h) }, w, h));
  new RysownikPdf(doc, page).rysuj(korzen, m);
}

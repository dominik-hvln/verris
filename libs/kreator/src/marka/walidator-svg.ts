/**
 * Kreator marki – walidator SVG sygnetu (symbol od AI i plik wgrany przez klienta), koncepcja 3.3.
 *
 * Zasada: NIE czyścimy podejrzanego pliku „do skutku” – parsujemy własnym ścisłym parserem XML (bez zależności,
 * bez encji, bez DOCTYPE), dopuszczamy tylko białą listę elementów i atrybutów, a wynik budujemy OD NOWA z samej
 * geometrii: jeden `<svg viewBox="0 0 100 100">` z elementami `<path>` (fill = currentColor albo akcent), liczby
 * zaokrąglone, przekształcenia spłaszczone. Nic z wejścia (atrybuty, tekst, identyfikatory) nie przechodzi
 * dosłownie do wyniku – dlatego XSS w wyniku jest niemożliwy z konstrukcji, a testy sprawdzają listę wektorów.
 *
 * Biała lista: svg, g, path, circle, ellipse, rect, polygon, polyline, line, defs, title, desc, metadata (ostatnie
 * trzy – pomijane). mask/clipPath/use – odrzucane (wycięcia mają być ścieżkami; ploter i druk nie rozumieją masek).
 * Atrybuty geometrii, fill/stroke (dla „ai”: currentColor, var(--akcent…), none; dla „wgrany”: dowolny kolor
 * mapowany na kanał główny/akcent wg jasności), fill-rule, stroke-width (obrys bez przeliczenia na kontur jest
 * odrzucany – symbol musi być z wypełnień), transform (translate/rotate/scale/matrix bez skosu – spłaszczane).
 */
import {
  type Macierz,
  type Segment,
  JEDNOSTKOWA,
  graniceSegmentow,
  parsujD,
  przeksztalcSegmenty,
  segmentyDoD,
  splaszczPodsciezki,
  zlozMacierze,
} from './sciezka-svg.ts';
import { type Ksztalt, obrys, odejmij, operacja, polacz, przetnij } from './geometria.ts';
import { hexDoOklch } from '../style/kolory.ts';

export type TrybWalidacji = 'ai' | 'wgrany';

export interface WynikWalidacjiSvg {
  ok: boolean;
  /** Znormalizowany SVG (tylko przy ok). */
  svg: string;
  bledy: string[];
  /** Statystyki (do reguł i logów). */
  elementy: number;
  wezly: number;
}

interface Wezel {
  nazwa: string;
  atr: Record<string, string>;
  dzieci: Wezel[];
  tekst: string;
}

const LIMITY: Record<TrybWalidacji, { elementy: number; wezly: number; bajty: number; glebokosc: number }> = {
  ai: { elementy: 8, wezly: 120, bajty: 20_000, glebokosc: 4 },
  wgrany: { elementy: 400, wezly: 12_000, bajty: 2_000_000, glebokosc: 12 },
};

const ELEMENTY_GEOMETRII = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const ELEMENTY_DOZWOLONE = new Set(['svg', 'g', 'defs', 'title', 'desc', 'metadata', 'mask', 'clipPath', ...ELEMENTY_GEOMETRII]);
const ELEMENTY_POMIJANE = new Set(['title', 'desc', 'metadata', 'defs']);
// mask/clipPath: tylko w defs albo bezpośrednio – liczone przez odwołanie url(#id), spłaszczane do konturów
const ATRYBUTY: Record<string, Set<string>> = {
  wspolne: new Set(['fill', 'fill-rule', 'clip-rule', 'transform', 'id', 'class', 'opacity', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'mask', 'clip-path']),
  svg: new Set(['xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height', 'version', 'x', 'y', 'preserveAspectRatio', 'xml:space', 'xmlns:svg']),
  g: new Set(['mask', 'clip-path']),
  mask: new Set(['id', 'maskUnits', 'maskContentUnits', 'x', 'y', 'width', 'height']),
  clipPath: new Set(['id', 'clipPathUnits']),
  path: new Set(['d']),
  circle: new Set(['cx', 'cy', 'r']),
  ellipse: new Set(['cx', 'cy', 'rx', 'ry']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry']),
  polygon: new Set(['points']),
  polyline: new Set(['points']),
  line: new Set(['x1', 'y1', 'x2', 'y2']),
};

class BladSvg extends Error {}

// ───────────────────────── ścisły parser XML (podzbiór) ─────────────────────────

const NAZWA = /^[A-Za-z_][A-Za-z0-9_.:-]*/;

function parsujXml(src: string, maksGlebokosc: number): Wezel {
  let i = 0;
  const s = src;
  const blad = (m: string): never => {
    throw new BladSvg(m);
  };
  const pomin = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  // prolog: <?xml ...?> dozwolony tylko na początku, komentarze dozwolone, DOCTYPE / CDATA / PI – nie
  const pominKomentarzeIProlog = (start: boolean) => {
    for (;;) {
      pomin();
      if (s.startsWith('<!--', i)) {
        const k = s.indexOf('-->', i + 4);
        if (k < 0) blad('Niezamknięty komentarz.');
        i = k + 3;
      } else if (/^<\?xml\s/.test(s.slice(i, i + 6)) && start) {
        const k = s.indexOf('?>', i);
        if (k < 0) blad('Niezamknięta deklaracja XML.');
        const dekl = s.slice(i, k);
        if (/encoding\s*=\s*["'](?!utf-8["'])/i.test(dekl)) blad('Dozwolone tylko kodowanie UTF-8.');
        i = k + 2;
        start = false;
      } else if (s.startsWith('<!', i)) {
        blad('Plik zawiera DOCTYPE, encje albo CDATA – niedozwolone.');
      } else if (s.startsWith('<?', i)) {
        blad('Instrukcje przetwarzania są niedozwolone.');
      } else return;
    }
  };
  const tekstBezEncji = (t: string): string => {
    // dozwolone tylko encje predefiniowane XML i numeryczne
    return t.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);|&/g, (_m, e: string | undefined) => {
      if (!e) return blad('Nieprawidłowy znak „&” albo nieznana encja.');
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      const kod = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(kod) || kod > 0x10ffff) blad('Nieprawidłowa encja numeryczna.');
      return String.fromCodePoint(kod);
    });
  };
  const element = (glebokosc: number): Wezel => {
    if (glebokosc > maksGlebokosc) blad('Zbyt głębokie zagnieżdżenie elementów.');
    if (s[i] !== '<') blad('Oczekiwano elementu.');
    i++;
    const m = NAZWA.exec(s.slice(i, i + 100));
    if (!m) blad('Nieprawidłowa nazwa elementu.');
    const nazwa = m![0];
    i += nazwa.length;
    const atr: Record<string, string> = {};
    for (;;) {
      const przed = i;
      pomin();
      if (s.startsWith('/>', i)) {
        i += 2;
        return { nazwa, atr, dzieci: [], tekst: '' };
      }
      if (s[i] === '>') {
        i++;
        break;
      }
      if (i === przed) blad('Brak odstępu między atrybutami.');
      const a = NAZWA.exec(s.slice(i, i + 100));
      if (!a) blad('Nieprawidłowa nazwa atrybutu.');
      const klucz = a![0];
      i += klucz.length;
      pomin();
      if (s[i] !== '=') blad('Atrybut bez wartości.');
      i++;
      pomin();
      const q = s[i];
      if (q !== '"' && q !== "'") blad('Wartość atrybutu bez cudzysłowu.');
      const k = s.indexOf(q, i + 1);
      if (k < 0) blad('Niezamknięta wartość atrybutu.');
      const surowa = s.slice(i + 1, k);
      if (surowa.includes('<')) blad('Znak „<” w wartości atrybutu.');
      if (Object.prototype.hasOwnProperty.call(atr, klucz)) blad('Zdublowany atrybut.');
      atr[klucz] = tekstBezEncji(surowa);
      i = k + 1;
    }
    const dzieci: Wezel[] = [];
    let tekst = '';
    for (;;) {
      const k = s.indexOf('<', i);
      if (k < 0) blad(`Niezamknięty element <${nazwa}>.`);
      tekst += tekstBezEncji(s.slice(i, k));
      i = k;
      if (s.startsWith('<!--', i)) {
        const e = s.indexOf('-->', i + 4);
        if (e < 0) blad('Niezamknięty komentarz.');
        i = e + 3;
        continue;
      }
      if (s.startsWith('<!', i) || s.startsWith('<?', i)) blad('CDATA, DOCTYPE i instrukcje przetwarzania są niedozwolone.');
      if (s.startsWith('</', i)) {
        i += 2;
        const z = NAZWA.exec(s.slice(i, i + 100));
        if (!z || z[0] !== nazwa) blad(`Błędne zamknięcie elementu <${nazwa}>.`);
        i += z![0].length;
        pomin();
        if (s[i] !== '>') blad('Błędne zamknięcie elementu.');
        i++;
        return { nazwa, atr, dzieci, tekst };
      }
      dzieci.push(element(glebokosc + 1));
    }
  };
  pominKomentarzeIProlog(true);
  const korzen = element(0);
  pominKomentarzeIProlog(false);
  if (i < s.length) blad('Dane po elemencie głównym.');
  return korzen;
}

// ───────────────────────── atrybuty i kolory ─────────────────────────

const liczbaAtr = (v: string | undefined, dom = 0): number => {
  if (v === undefined) return dom;
  const t = v.trim().replace(/px$/, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) throw new BladSvg(`Nieprawidłowa liczba „${v.slice(0, 20)}”.`);
  return Number(t);
};

function parsujTransform(t: string): Macierz {
  let m: Macierz = JEDNOSTKOWA;
  const re = /\s*(translate|rotate|scale|matrix)\s*\(([^)]*)\)\s*,?/gy;
  let poz = 0;
  let r: RegExpExecArray | null;
  const reszta = t.trim();
  re.lastIndex = 0;
  while (poz < reszta.length && (r = re.exec(reszta))) {
    poz = re.lastIndex;
    const a = r[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((x) => liczbaAtr(x));
    let n: Macierz;
    switch (r[1]) {
      case 'translate':
        n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const k = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(k);
        const s = Math.sin(k);
        const cx = a[1] ?? 0;
        const cy = a[2] ?? 0;
        n = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      default: {
        if (a.length !== 6) throw new BladSvg('Nieprawidłowe matrix().');
        n = a as Macierz;
        // tylko obrót/skala/przesunięcie (bez skosu): kolumny prostopadłe
        const iloczyn = n[0] * n[2] + n[1] * n[3];
        if (Math.abs(iloczyn) > 1e-6 * (Math.hypot(n[0], n[1]) * Math.hypot(n[2], n[3]) + 1e-12))
          throw new BladSvg('Przekształcenie ze skosem jest niedozwolone.');
      }
    }
    m = zlozMacierze(m, n);
  }
  if (poz < reszta.length) throw new BladSvg('Dozwolone przekształcenia: translate, rotate, scale.');
  return m;
}

const KOLORY_NAZW: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  gray: '#808080', grey: '#808080', orange: '#ffa500', navy: '#000080', teal: '#008080', maroon: '#800000',
  purple: '#800080', silver: '#c0c0c0', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff',
};

type Kanal = 'glowny' | 'akcent' | 'brak';

/** Kolor wypełnienia → kanał. 'ai': tylko tokeny; 'wgrany': kolor zamieniany na kanał (null = jasność do decyzji). */
function kanalKoloru(v: string, tryb: TrybWalidacji): Kanal | { hex: string } {
  const t = v.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'none' || t === 'transparent') return 'brak';
  if (t === 'currentcolor') return 'glowny';
  if (/^var\(\s*--akcent\s*(,\s*currentcolor\s*)?\)$/.test(t)) return 'akcent';
  if (tryb === 'ai') throw new BladSvg('Kolory symbolu: tylko currentColor, var(--akcent) albo none.');
  if (/url\s*\(/.test(t)) throw new BladSvg('Gradienty i wzory (url()) są niedozwolone – wypełnienie musi być jednolite.');
  let hex = KOLORY_NAZW[t];
  if (!hex && /^#[0-9a-f]{3}$/.test(t)) hex = '#' + [...t.slice(1)].map((c) => c + c).join('');
  if (!hex && /^#[0-9a-f]{6}$/.test(t)) hex = t;
  if (!hex) {
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t);
    if (m) hex = '#' + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  }
  if (!hex) throw new BladSvg(`Nieobsługiwany kolor „${v.slice(0, 24)}”.`);
  return { hex };
}

// ───────────────────────── geometria elementów ─────────────────────────

const k4 = 0.5522847498;

function elipsaSegmenty(cx: number, cy: number, rx: number, ry: number): Segment[] {
  return [
    { t: 'M', p: [cx + rx, cy] },
    { t: 'C', c1: [cx + rx, cy + ry * k4], c2: [cx + rx * k4, cy + ry], p: [cx, cy + ry] },
    { t: 'C', c1: [cx - rx * k4, cy + ry], c2: [cx - rx, cy + ry * k4], p: [cx - rx, cy] },
    { t: 'C', c1: [cx - rx, cy - ry * k4], c2: [cx - rx * k4, cy - ry], p: [cx, cy - ry] },
    { t: 'C', c1: [cx + rx * k4, cy - ry], c2: [cx + rx, cy - ry * k4], p: [cx + rx, cy] },
    { t: 'Z' },
  ];
}

function punkty(v: string | undefined): [number, number][] {
  const l = (v ?? '').trim().split(/[\s,]+/).filter(Boolean).map((x) => liczbaAtr(x));
  if (l.length % 2 || l.length < 4) throw new BladSvg('Nieprawidłowa lista punktów.');
  const w: [number, number][] = [];
  for (let i = 0; i < l.length; i += 2) w.push([l[i], l[i + 1]]);
  return w;
}

function geometria(w: Wezel): Segment[] {
  const a = w.atr;
  switch (w.nazwa) {
    case 'path': {
      const seg = parsujD(a.d ?? '');
      if (!seg) throw new BladSvg('Nieprawidłowe dane ścieżki (atrybut d).');
      return seg;
    }
    case 'circle': {
      const r = liczbaAtr(a.r);
      if (r <= 0) return [];
      return elipsaSegmenty(liczbaAtr(a.cx), liczbaAtr(a.cy), r, r);
    }
    case 'ellipse': {
      const rx = liczbaAtr(a.rx);
      const ry = liczbaAtr(a.ry);
      if (rx <= 0 || ry <= 0) return [];
      return elipsaSegmenty(liczbaAtr(a.cx), liczbaAtr(a.cy), rx, ry);
    }
    case 'rect': {
      const x = liczbaAtr(a.x);
      const y = liczbaAtr(a.y);
      const wd = liczbaAtr(a.width);
      const h = liczbaAtr(a.height);
      if (wd <= 0 || h <= 0) return [];
      let rx = a.rx !== undefined ? liczbaAtr(a.rx) : a.ry !== undefined ? liczbaAtr(a.ry) : 0;
      let ry = a.ry !== undefined ? liczbaAtr(a.ry) : rx;
      rx = Math.min(Math.max(rx, 0), wd / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      if (!rx || !ry)
        return [{ t: 'M', p: [x, y] }, { t: 'L', p: [x + wd, y] }, { t: 'L', p: [x + wd, y + h] }, { t: 'L', p: [x, y + h] }, { t: 'Z' }];
      const kx = rx * k4;
      const ky = ry * k4;
      return [
        { t: 'M', p: [x + rx, y] },
        { t: 'L', p: [x + wd - rx, y] },
        { t: 'C', c1: [x + wd - rx + kx, y], c2: [x + wd, y + ry - ky], p: [x + wd, y + ry] },
        { t: 'L', p: [x + wd, y + h - ry] },
        { t: 'C', c1: [x + wd, y + h - ry + ky], c2: [x + wd - rx + kx, y + h], p: [x + wd - rx, y + h] },
        { t: 'L', p: [x + rx, y + h] },
        { t: 'C', c1: [x + rx - kx, y + h], c2: [x, y + h - ry + ky], p: [x, y + h - ry] },
        { t: 'L', p: [x, y + ry] },
        { t: 'C', c1: [x, y + ry - ky], c2: [x + rx - kx, y], p: [x + rx, y] },
        { t: 'Z' },
      ];
    }
    case 'polygon':
    case 'polyline': {
      const p = punkty(a.points);
      const s: Segment[] = [{ t: 'M', p: p[0] }, ...p.slice(1).map((q): Segment => ({ t: 'L', p: q }))];
      return w.nazwa === 'polygon' ? [...s, { t: 'Z' }] : s;
    }
    case 'line':
      return [
        { t: 'M', p: [liczbaAtr(a.x1), liczbaAtr(a.y1)] },
        { t: 'L', p: [liczbaAtr(a.x2), liczbaAtr(a.y2)] },
      ];
    default:
      return [];
  }
}

// ───────────────────────── walidacja ─────────────────────────

interface Element {
  seg: Segment[];
  /** Kontury (po masce, obrysie, wycięciu bieli) – zamiast `seg`. */
  ksztalt?: Ksztalt;
  kanal: Kanal | { hex: string };
  regula: 'evenodd' | 'nonzero';
}

function doKsztaltu(e: Element): Ksztalt {
  if (e.ksztalt) return e.ksztalt;
  const pod = splaszczPodsciezki(e.seg, 0.05).map((p) => p.pts);
  // normalizacja reguły wypełnienia do czystych konturów
  return operacja(pod, [], (a) => a, { parzystoscA: e.regula === 'evenodd' });
}

/**
 * Waliduje i normalizuje SVG sygnetu. Wynik: `<svg xmlns viewBox="0 0 100 100">` z samymi `<path>`
 * (fill currentColor / var(--akcent, currentColor), fill-rule z wejścia), znak przeskalowany i wyśrodkowany
 * w polu 4–96.
 */
export function walidujSvgSygnetu(svg: string, o: { tryb: TrybWalidacji }): WynikWalidacjiSvg {
  const lim = LIMITY[o.tryb];
  const nieudany = (bledy: string[]): WynikWalidacjiSvg => ({ ok: false, svg: '', bledy, elementy: 0, wezly: 0 });
  if (typeof svg !== 'string' || !svg.trim()) return nieudany(['Pusty plik SVG.']);
  if (svg.length > lim.bajty) return nieudany(['Plik SVG jest za duży.']);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg)) return nieudany(['Niedozwolone znaki sterujące.']);
  try {
    const korzen = parsujXml(svg.replace(/^﻿/, ''), lim.glebokosc);
    if (korzen.nazwa !== 'svg') throw new BladSvg('Element główny musi być <svg>.');
    if (korzen.atr.xmlns !== undefined && korzen.atr.xmlns !== 'http://www.w3.org/2000/svg')
      throw new BladSvg('Nieprawidłowa przestrzeń nazw SVG.');
    // viewBox
    let vb: [number, number, number, number];
    if (korzen.atr.viewBox) {
      const v = korzen.atr.viewBox.trim().split(/[\s,]+/).map((x) => liczbaAtr(x));
      if (v.length !== 4 || v[2] <= 0 || v[3] <= 0) throw new BladSvg('Nieprawidłowy viewBox.');
      vb = v as [number, number, number, number];
    } else if (korzen.atr.width && korzen.atr.height) {
      vb = [0, 0, liczbaAtr(korzen.atr.width), liczbaAtr(korzen.atr.height)];
      if (vb[2] <= 0 || vb[3] <= 0) throw new BladSvg('Nieprawidłowe wymiary.');
    } else throw new BladSvg('Brak viewBox.');
    if (o.tryb === 'ai' && (vb[0] !== 0 || vb[1] !== 0 || vb[2] !== 100 || vb[3] !== 100))
      throw new BladSvg('Symbol od AI musi mieć viewBox="0 0 100 100".');

    // definicje masek i ścieżek przycinania (tylko lokalne #id)
    const definicje = new Map<string, Wezel>();
    const zbierzDef = (w: Wezel) => {
      if ((w.nazwa === 'mask' || w.nazwa === 'clipPath') && w.atr.id) definicje.set(w.atr.id, w);
      w.dzieci.forEach(zbierzDef);
    };
    zbierzDef(korzen);

    let licznikElementow = 0;
    let wezlyWejscia = 0;
    interface Styl {
      fill: string;
      regula: string;
      stroke: string;
      szer: string;
      konce: string;
      zlacza: string;
    }
    const STYL_POCZ: Styl = {
      // fill domyślny SVG = czarny → w trybie „ai” brak deklaracji koloru = currentColor
      fill: o.tryb === 'ai' ? 'currentColor' : '#000000',
      regula: 'nonzero',
      stroke: 'none',
      szer: '1',
      konce: 'butt',
      zlacza: 'miter',
    };
    const odwolanie = (v: string | undefined): Wezel | null => {
      if (v === undefined || v.trim() === 'none') return null;
      const m = /^\s*url\(\s*#([A-Za-z_][\w.-]*)\s*\)\s*$/.exec(v);
      if (!m) throw new BladSvg('Dozwolone tylko lokalne odwołania url(#id).');
      const d = definicje.get(m[1]);
      if (!d) throw new BladSvg('Odwołanie do nieistniejącej maski lub ścieżki przycinania.');
      return d;
    };
    const odwiedz = (w: Wezel, m: Macierz, st: Styl, wyj: Element[], wMasce: boolean) => {
      if (w.nazwa === 'mask' || w.nazwa === 'clipPath') return; // używane tylko przez odwołanie
      if (!ELEMENTY_DOZWOLONE.has(w.nazwa)) throw new BladSvg(`Niedozwolony element <${w.nazwa.slice(0, 30)}>.`);
      if (ELEMENTY_POMIJANE.has(w.nazwa)) {
        if (w.nazwa === 'defs') for (const d of w.dzieci) if (!['mask', 'clipPath'].includes(d.nazwa)) sprawdzBezpieczne(d);
        return;
      }
      const dozw = new Set([...ATRYBUTY.wspolne, ...(ATRYBUTY[w.nazwa] ?? [])]);
      for (const [k, v] of Object.entries(w.atr)) {
        if (/^on/i.test(k)) throw new BladSvg('Atrybuty zdarzeń (on…) są niedozwolone.');
        if (/href$/i.test(k)) throw new BladSvg('Odwołania (href) są niedozwolone.');
        if (k === 'style') throw new BladSvg('Atrybut style jest niedozwolony – użyj fill.');
        if (!dozw.has(k)) throw new BladSvg(`Niedozwolony atrybut „${k.slice(0, 30)}”.`);
        if (/javascript:|expression\s*\(|data:/i.test(v)) throw new BladSvg('Niedozwolona wartość atrybutu.');
        if (/url\s*\(/i.test(v) && !['fill', 'stroke', 'mask', 'clip-path'].includes(k)) throw new BladSvg('Niedozwolona wartość atrybutu.');
      }
      if (w.tekst.trim()) throw new BladSvg('Tekst w symbolu jest niedozwolony.');
      for (const k of ['opacity', 'fill-opacity', 'stroke-opacity'])
        if (w.atr[k] !== undefined && liczbaAtr(w.atr[k]) < 1) throw new BladSvg('Przezroczystość jest niedozwolona.');
      const mm = w.atr.transform ? zlozMacierze(m, parsujTransform(w.atr.transform)) : m;
      const s2: Styl = {
        fill: w.atr.fill ?? st.fill,
        regula: w.atr['fill-rule'] ?? st.regula,
        stroke: w.atr.stroke ?? st.stroke,
        szer: w.atr['stroke-width'] ?? st.szer,
        konce: w.atr['stroke-linecap'] ?? st.konce,
        zlacza: w.atr['stroke-linejoin'] ?? st.zlacza,
      };
      const maska = odwolanie(w.atr.mask);
      const przyc = odwolanie(w.atr['clip-path']);
      const lokalne: Element[] = [];
      if (!ELEMENTY_GEOMETRII.has(w.nazwa)) {
        for (const d of w.dzieci) odwiedz(d, mm, s2, lokalne, wMasce);
      } else {
        licznikElementow++;
        if (licznikElementow > lim.elementy) throw new BladSvg(`Za dużo elementów (limit ${lim.elementy}).`);
        const geo = geometria(w);
        wezlyWejscia += geo.filter((x) => x.t !== 'Z').length;
        if (wezlyWejscia > lim.wezly) throw new BladSvg(`Za dużo węzłów ścieżek (limit ${lim.wezly}).`);
        const tryb = wMasce ? 'wgrany' : o.tryb;
        const kanalF = w.nazwa === 'line' ? 'brak' : kanalKoloru(s2.fill, tryb);
        if (kanalF !== 'brak' && geo.length)
          lokalne.push({ seg: przeksztalcSegmenty(geo, mm), kanal: kanalF, regula: s2.regula === 'evenodd' ? 'evenodd' : 'nonzero' });
        // obrys → kontur (stała grubość po przekształceniu; skala = pierwiastek z wyznacznika)
        const kanalS = kanalKoloru(s2.stroke, tryb);
        const szer = liczbaAtr(s2.szer, 1) * Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2]));
        if (kanalS !== 'brak' && szer > 0 && geo.length) {
          const pod = splaszczPodsciezki(przeksztalcSegmenty(geo, mm), szer / 40);
          const kontur = polacz(
            ...pod.map((p) =>
              obrys(p.pts, szer, {
                zamknieta: p.zamknieta,
                konce: s2.konce === 'round' ? 'okragle' : 'proste',
                zlacza: s2.zlacza === 'round' ? 'okragle' : 'ostre',
              }),
            ),
          );
          if (kontur.length) lokalne.push({ seg: [], ksztalt: kontur, kanal: kanalS, regula: 'nonzero' });
        }
      }
      // maska (luminancja: jasne dodaje, ciemne odejmuje) i ścieżka przycinania → przecięcie konturów
      if (maska || przyc) {
        let obszar: Ksztalt | null = null;
        for (const def of [maska, przyc]) {
          if (!def) continue;
          const el: Element[] = [];
          for (const d of def.dzieci) odwiedz(d, mm, { ...STYL_POCZ, fill: def.nazwa === 'clipPath' ? '#ffffff' : '#000000' }, el, true);
          let k: Ksztalt = [];
          for (const e of el) {
            const jasny = def.nazwa === 'clipPath' || typeof e.kanal !== 'object' || hexDoOklch(e.kanal.hex).l > 0.6;
            k = jasny ? polacz(k, doKsztaltu(e)) : odejmij(k, doKsztaltu(e));
          }
          obszar = obszar ? przetnij(obszar, k) : k;
        }
        for (const e of lokalne) {
          const k = przetnij(doKsztaltu(e), obszar ?? []);
          if (k.length) wyj.push({ seg: [], ksztalt: k, kanal: e.kanal, regula: 'nonzero' });
        }
      } else wyj.push(...lokalne);
    };
    const sprawdzBezpieczne = (w: Wezel) => {
      if (!ELEMENTY_DOZWOLONE.has(w.nazwa) && w.nazwa !== 'mask' && w.nazwa !== 'clipPath')
        throw new BladSvg(`Niedozwolony element <${w.nazwa.slice(0, 30)}>.`);
      for (const k of Object.keys(w.atr)) if (/^on|href$|^style$/i.test(k)) throw new BladSvg('Niedozwolony atrybut w definicjach.');
      w.dzieci.forEach(sprawdzBezpieczne);
    };
    for (const d of definicje.values()) sprawdzBezpieczne(d);
    let elementy: Element[] = [];
    odwiedz(korzen, JEDNOSTKOWA, STYL_POCZ, elementy, false);
    if (!elementy.length) throw new BladSvg('Symbol nie zawiera żadnego kształtu.');
    const wezly = wezlyWejscia;

    // biel w pliku wgranym = „wycięcie” (malowana na wcześniejszych kształtach) – odejmujemy ją od nich
    if (o.tryb === 'wgrany') {
      const bialy = (e: Element) => typeof e.kanal === 'object' && hexDoOklch(e.kanal.hex).l > 0.97 && hexDoOklch(e.kanal.hex).c < 0.03;
      if (elementy.some(bialy)) {
        const wyn: Element[] = [];
        for (const e of elementy) {
          if (bialy(e)) {
            const b = doKsztaltu(e);
            for (let q = 0; q < wyn.length; q++) wyn[q] = { ...wyn[q], seg: [], ksztalt: odejmij(doKsztaltu(wyn[q]), b), regula: 'nonzero' };
          } else wyn.push(e);
        }
        elementy = wyn.filter((e) => !e.ksztalt || e.ksztalt.length);
        if (!elementy.length) throw new BladSvg('Symbol nie zawiera widocznego kształtu.');
      }
    }
    // kontury → segmenty (jeden format dalej)
    for (const e of elementy)
      if (e.ksztalt) {
        e.seg = e.ksztalt.flatMap((k): Segment[] => [{ t: 'M', p: k[0] }, ...k.slice(1).map((q): Segment => ({ t: 'L', p: q })), { t: 'Z' }]);
        e.regula = 'evenodd';
      }

    // granice w układzie viewBox; elementy poza viewBox → błąd (ai) / przycięcie przez skalowanie (wgrany)
    const wsz = elementy.flatMap((e) => e.seg);
    const g = graniceSegmentow(wsz);
    if (!Number.isFinite(g.x0) || g.x1 - g.x0 < 1e-6 || g.y1 - g.y0 < 1e-6) throw new BladSvg('Symbol ma zerowy rozmiar.');
    if (o.tryb === 'ai') {
      const tol = 0.5;
      if (g.x0 < vb[0] - tol || g.y0 < vb[1] - tol || g.x1 > vb[0] + vb[2] + tol || g.y1 > vb[1] + vb[3] + tol)
        throw new BladSvg('Elementy wychodzą poza viewBox.');
    }

    // kanały dla pliku wgranego: najciemniejszy kolor = główny, wyraźnie inne = akcent
    const hexy = [...new Set(elementy.flatMap((e) => (typeof e.kanal === 'object' ? [e.kanal.hex] : [])))];
    const mapaHex = new Map<string, Kanal>();
    if (hexy.length) {
      const jasnosc = hexy.map((hex) => ({ hex, ...hexDoOklch(hex) })).sort((a, b) => a.l - b.l);
      const glowny = jasnosc[0];
      for (const j of jasnosc)
        mapaHex.set(j.hex, Math.abs(j.l - glowny.l) < 0.08 && Math.abs(j.c - glowny.c) < 0.05 ? 'glowny' : 'akcent');
    }

    // normalizacja do pola 4–96 (zachowanie proporcji, wyśrodkowanie)
    const s = 92 / Math.max(g.x1 - g.x0, g.y1 - g.y0);
    const mNorm: Macierz = [s, 0, 0, s, 50 - ((g.x0 + g.x1) / 2) * s, 50 - ((g.y0 + g.y1) / 2) * s];
    const sciezki = elementy
      .map((e) => {
        const kanal = typeof e.kanal === 'object' ? (mapaHex.get(e.kanal.hex) ?? 'glowny') : e.kanal;
        if (kanal === 'brak') return '';
        const d = segmentyDoD(przeksztalcSegmenty(e.seg, mNorm), 2);
        const fill = kanal === 'akcent' ? 'var(--akcent, currentColor)' : 'currentColor';
        return `<path fill="${fill}" fill-rule="${e.regula}" d="${d}"/>`;
      })
      .filter(Boolean);
    if (!sciezki.length) throw new BladSvg('Symbol nie zawiera widocznego kształtu.');
    const wynik = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${sciezki.join('')}</svg>`;
    return { ok: true, svg: wynik, bledy: [], elementy: elementy.length, wezly };
  } catch (e) {
    if (e instanceof BladSvg) return nieudany([e.message]);
    return nieudany(['Nie udało się odczytać pliku SVG.']);
  }
}

/** Wnętrze znormalizowanego SVG (same `<path>`) – do wstawienia w złożone logo. */
export function wnetrzeSvg(svg: string): string {
  const m = /^<svg\b[^>]*>([\s\S]*)<\/svg>$/.exec(svg.trim());
  return m ? m[1] : '';
}

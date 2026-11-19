import { rgbDoOklab } from '../../style/kolory.ts';
import { odlegloscLab, type Piksele } from './kolory-obrazu.ts';

/**
 * Wektoryzacja wgranego logo (PNG/JPG → ścieżki SVG) – własna implementacja, bez GPL (potrace odpada licencyjnie
 * przy dystrybucji; tu nic nie jest zapożyczone z jego kodu):
 *
 *  1. Pole przynależności per kolor (0–1): piksel rzutowany na odcinek „najbliższy inny kolor → ten kolor” w OKLab,
 *     pomnożony przez alfę. Wygładzone krawędzie dają wartości pośrednie, więc kontur wypada z dokładnością
 *     podpikselową, a granica dwóch stykających się kolorów jest ta sama dla obu (t i 1 − t).
 *  2. Marching squares na środkach pikseli, próg 0,5, interpolacja liniowa na krawędziach komórek; siodła
 *     rozstrzygane średnią komórki. Odcinki skierowane (wnętrze zawsze po tej samej stronie), łączone po
 *     identyfikatorach krawędzi siatki – kontury zawsze domknięte (ramka obrazu = 0).
 *  3. Narożniki: lokalne maksimum skrętu > 50° mierzonego na łuku ±2,5 px.
 *  4. Odcinki między narożnikami: Ramer–Douglas–Peucker – gdy wszystko mieści się w tolerancji cięciwy, linia prosta;
 *     inaczej dopasowanie krzywych Béziera 3. stopnia metodą najmniejszych kwadratów z parametryzacją długością
 *     cięciwy, poprawą parametrów Newtonem–Raphsonem i podziałem w punkcie największego błędu (metoda opisana
 *     przez P. J. Schneidera, „An Algorithm for Automatically Fitting Digitized Curves”, Graphics Gems, 1990).
 *     Kontur bez narożników (koło) dzielony na 4 łuki ze wspólnymi stycznymi – gładkie przejścia.
 *  5. Wszystkie kontury koloru w jednej ścieżce z `fill-rule="evenodd"` – otwory (wnętrze „O”, „A”) wychodzą same.
 *  6. Przeskalowanie obrysu treści do viewBox 0 0 100 100 (proporcje zachowane, wyśrodkowane), liczby z 1 miejscem.
 *
 * Kolory → kanały: pierwszy (największy udział) = główny (`currentColor`), drugi = akcent
 * (`var(--akcent, currentColor)`), kolejne – dodatkowe (stały hex). Jakość pilnuje test: rasteryzacja wyniku
 * (`rasteryzujWektor`) vs maska źródła (IoU) na kole, literze z otworem i dwóch kolorach.
 */

type Lab = [number, number, number];
type Pkt = [number, number];

export type KanalKoloru = 'glowny' | 'akcent' | 'dodatkowy';

export interface OpcjeWektoryzacji {
  /** Kolory logo (hex) – zwykle z `kolorySzkieletowe`, od największego udziału. */
  kolory: string[];
  /** Kolor tła (hex) – piksele tła nie należą do żadnego koloru; null/brak = tło przezroczyste albo brak tła. */
  tlo?: string | null;
  /** Przypisanie kanałów (domyślnie: 0 → główny, 1 → akcent, reszta – dodatkowe). */
  kanaly?: KanalKoloru[];
  /** Tolerancja dopasowania w pikselach źródła (domyślnie max(0,5; krótszy bok / 200)). */
  tolerancja?: number;
  /** Margines w jednostkach viewBox (domyślnie 2). */
  margines?: number;
  /** Miejsca po przecinku we współrzędnych (domyślnie 1). */
  miejsca?: number;
  /** Minimalne pole konturu w px² (mniejsze to szum JPG; domyślnie 0,0002 pola obrazu, nie mniej niż 4). */
  minPole?: number;
}

export interface SciezkaWektora {
  kolor: string;
  kanal: KanalKoloru;
  /** Ścieżka w viewBox 0 0 100 100 (M/L/C/Z, współrzędne bezwzględne), fill-rule evenodd. */
  d: string;
  kontury: number;
  /** Węzły (punkty końcowe odcinków i krzywych). */
  wezly: number;
}

export interface WynikWektoryzacji {
  sciezki: SciezkaWektora[];
  /** Samodzielny SVG (viewBox 0 0 100 100, kanały jak w bibliotece sygnetów). */
  svg: string;
  wezly: number;
  /** Przekształcenie px źródła → viewBox: v = px × skala + przesuniecie. */
  przeksztalcenie: { skala: number; dx: number; dy: number };
}

function labZHex(hex: string): Lab {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgbDoOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function rgbZHex(hex: string): Lab {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Pola przynależności pikseli do kolorów (0–1). Dwa najbliższe kolory (z tłem) wybieramy w OKLab, a udział liczymy
 * rzutem w sRGB (wartości zakodowane gammą) – w tej przestrzeni renderery mieszają kolory krawędzi przy wygładzaniu,
 * więc t = 0,5 to rzeczywiście połowa pokrycia piksela (w OKLab granica przesuwałaby się o ok. ćwierć piksela).
 */
function polaPrzynaleznosci(piksele: Piksele, szer: number, wys: number, kolory: string[], tlo: string | null): Float32Array[] {
  const pola = kolory.map(() => new Float32Array(szer * wys));
  const hexy = tlo ? [...kolory, tlo] : kolory;
  const lab = hexy.map(labZHex);
  const rgb = hexy.map(rgbZHex);
  for (let i = 0; i < szer * wys; i++) {
    const o = i * 4;
    const alfa = piksele[o + 3] / 255;
    if (alfa <= 0.02) continue;
    const p = rgbDoOklab(piksele[o], piksele[o + 1], piksele[o + 2]);
    // Dwa najbliższe kolory (z tłem).
    let a = -1;
    let b = -1;
    let da = Infinity;
    let db = Infinity;
    for (let j = 0; j < lab.length; j++) {
      const d = odlegloscLab(p, lab[j]);
      if (d < da) {
        b = a;
        db = da;
        a = j;
        da = d;
      } else if (d < db) {
        b = j;
        db = d;
      }
    }
    if (a < 0) continue;
    if (b < 0) {
      // Jeden kolor bez tła (tło przezroczyste) – udział = alfa.
      if (a < kolory.length) pola[a][i] = alfa;
      continue;
    }
    // Rzut na odcinek b → a w sRGB: t = 1 przy kolorze a, 0 przy kolorze b.
    const A = rgb[a];
    const B = rgb[b];
    const q: Lab = [piksele[o], piksele[o + 1], piksele[o + 2]];
    const ab: Lab = [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
    const dl2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    let t = dl2 > 1e-9 ? ((q[0] - B[0]) * ab[0] + (q[1] - B[1]) * ab[1] + (q[2] - B[2]) * ab[2]) / dl2 : 1;
    t = Math.min(1, Math.max(0, t));
    const odOdcinka = Math.hypot(q[0] - (B[0] + ab[0] * t), q[1] - (B[1] + ab[1] * t), q[2] - (B[2] + ab[2] * t));
    if (odOdcinka > 40) t = 1; // kolor spoza odcinka – przypisanie do najbliższego
    if (a < kolory.length) pola[a][i] = t * alfa;
    if (b < kolory.length) pola[b][i] = Math.max(pola[b][i], (1 - t) * alfa);
  }
  return pola;
}

/** Marching squares: domknięte kontury pola na progu 0,5 (punkty w px źródła, środek piksela = x + 0,5). */
export function konturyPola(pole: Float32Array | number[], szer: number, wys: number): Pkt[][] {
  const W = szer + 2;
  const v = (x: number, y: number) => (x < 0 || y < 0 || x >= szer || y >= wys ? 0 : pole[y * szer + x]);
  const pozycja = (x: number, y: number): Pkt => [x + 0.5, y + 0.5];
  const idH = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2;
  const idV = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2 + 1;
  const punkty = new Map<number, Pkt>();
  const nastepny = new Map<number, number>();

  const interp = (x1: number, y1: number, x2: number, y2: number): Pkt => {
    const a = v(x1, y1);
    const b = v(x2, y2);
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : (0.5 - a) / (b - a);
    const [px1, py1] = pozycja(x1, y1);
    const [px2, py2] = pozycja(x2, y2);
    return [px1 + (px2 - px1) * t, py1 + (py2 - py1) * t];
  };

  for (let cy = 0; cy <= wys; cy++) {
    for (let cx = 0; cx <= szer; cx++) {
      // Narożniki: tl(cx-1,cy-1) tr(cx,cy-1) br(cx,cy) bl(cx-1,cy).
      const naroz: [number, number][] = [[cx - 1, cy - 1], [cx, cy - 1], [cx, cy], [cx - 1, cy]];
      const wart = naroz.map(([x, y]) => v(x, y));
      const wew = wart.map((x) => x >= 0.5);
      const ile = wew.filter(Boolean).length;
      if (ile === 0 || ile === 4) continue;
      // Krawędzie: 0 = T (tl–tr), 1 = R (tr–br), 2 = B (br–bl), 3 = L (bl–tl).
      const krawedz = (k: number): { id: number; p: Pkt } => {
        const [a, b] = [naroz[k], naroz[(k + 1) % 4]];
        const id = k === 0 ? idH(cx - 1, cy - 1) : k === 1 ? idV(cx, cy - 1) : k === 2 ? idH(cx - 1, cy) : idV(cx - 1, cy - 1);
        return { id, p: interp(a[0], a[1], b[0], b[1]) };
      };
      // Odcinki jako pary krawędzi + zbiór narożników po jednej stronie.
      const odcinki: { k1: number; k2: number; strona: number[] }[] = [];
      const ciecieNaroznika = (n: number) => ({ k1: (n + 3) % 4, k2: n, strona: [n] }); // narożnik n leży między krawędzią n-1 i n
      const siodlo = ile === 2 && wew[0] === wew[2];
      if (siodlo) {
        const srodekWew = (wart[0] + wart[1] + wart[2] + wart[3]) / 4 >= 0.5;
        // Środek wewnątrz – odcinamy narożniki zewnętrzne; na zewnątrz – wewnętrzne.
        for (let n = 0; n < 4; n++) if (wew[n] !== srodekWew) odcinki.push(ciecieNaroznika(n));
      } else if (ile === 1 || ile === 3) {
        const n = wew.findIndex((x) => x === (ile === 1));
        odcinki.push(ciecieNaroznika(n));
      } else {
        // Dwa sąsiednie narożniki wewnątrz.
        const n = [0, 1, 2, 3].find((q) => wew[q] && wew[(q + 1) % 4])!;
        // Narożniki n i n+1 leżą po jednej stronie odcinka łączącego krawędzie n-1 i n+1.
        odcinki.push({ k1: (n + 3) % 4, k2: (n + 1) % 4, strona: [n, (n + 1) % 4] });
      }
      for (const o of odcinki) {
        const e1 = krawedz(o.k1);
        const e2 = krawedz(o.k2);
        const ref = o.strona.map((n) => pozycja(naroz[n][0], naroz[n][1]));
        const rx = ref.reduce((s, p) => s + p[0], 0) / ref.length;
        const ry = ref.reduce((s, p) => s + p[1], 0) / ref.length;
        const stronaWew = wew[o.strona[0]];
        const krzyz = (e2.p[0] - e1.p[0]) * (ry - e1.p[1]) - (e2.p[1] - e1.p[1]) * (rx - e1.p[0]);
        // Wnętrze zawsze po dodatniej stronie iloczynu (w układzie y w dół: po prawej ręce idącego).
        const [od, doo] = (krzyz > 0) === stronaWew ? [e1, e2] : [e2, e1];
        punkty.set(od.id, od.p);
        punkty.set(doo.id, doo.p);
        nastepny.set(od.id, doo.id);
      }
    }
  }

  const kontury: Pkt[][] = [];
  const odwiedzone = new Set<number>();
  for (const start of nastepny.keys()) {
    if (odwiedzone.has(start)) continue;
    const kontur: Pkt[] = [];
    let id: number | undefined = start;
    while (id !== undefined && !odwiedzone.has(id)) {
      odwiedzone.add(id);
      kontur.push(punkty.get(id)!);
      id = nastepny.get(id);
    }
    if (kontur.length >= 3) kontury.push(kontur);
  }
  return kontury;
}

export function poleKonturu(k: Pkt[]): number {
  let s = 0;
  for (let i = 0; i < k.length; i++) {
    const [x1, y1] = k[i];
    const [x2, y2] = k[(i + 1) % k.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Ramer–Douglas–Peucker dla łamanej otwartej (indeksy zachowanych punktów). */
export function rdp(punkty: Pkt[], eps: number): number[] {
  const zachowaj = new Uint8Array(punkty.length);
  zachowaj[0] = 1;
  zachowaj[punkty.length - 1] = 1;
  const stos: [number, number][] = [[0, punkty.length - 1]];
  while (stos.length) {
    const [a, b] = stos.pop()!;
    let maks = -1;
    let gdzie = -1;
    const [ax, ay] = punkty[a];
    const [bx, by] = punkty[b];
    const dl = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const [px, py] = punkty[i];
      const d = dl < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / dl;
      if (d > maks) {
        maks = d;
        gdzie = i;
      }
    }
    if (maks > eps && gdzie > 0) {
      zachowaj[gdzie] = 1;
      stos.push([a, gdzie], [gdzie, b]);
    }
  }
  const wynik: number[] = [];
  zachowaj.forEach((z, i) => z && wynik.push(i));
  return wynik;
}

// --- Dopasowanie krzywych Béziera ---

type Bezier = [Pkt, Pkt, Pkt, Pkt];
const dod = (a: Pkt, b: Pkt): Pkt => [a[0] + b[0], a[1] + b[1]];
const od = (a: Pkt, b: Pkt): Pkt => [a[0] - b[0], a[1] - b[1]];
const razy = (a: Pkt, s: number): Pkt => [a[0] * s, a[1] * s];
const il = (a: Pkt, b: Pkt) => a[0] * b[0] + a[1] * b[1];
const dlug = (a: Pkt) => Math.hypot(a[0], a[1]);
const norm = (a: Pkt): Pkt => {
  const d = dlug(a);
  return d < 1e-12 ? [0, 0] : [a[0] / d, a[1] / d];
};

function bez(b: Bezier, t: number): Pkt {
  const m = 1 - t;
  const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
  return [w[0] * b[0][0] + w[1] * b[1][0] + w[2] * b[2][0] + w[3] * b[3][0], w[0] * b[0][1] + w[1] * b[1][1] + w[2] * b[2][1] + w[3] * b[3][1]];
}

function bezPochodna(b: Bezier, t: number): Pkt {
  const m = 1 - t;
  const p1 = razy(od(b[1], b[0]), 3 * m * m);
  const p2 = razy(od(b[2], b[1]), 6 * m * t);
  const p3 = razy(od(b[3], b[2]), 3 * t * t);
  return dod(dod(p1, p2), p3);
}

function bezDruga(b: Bezier, t: number): Pkt {
  const a = razy(dod(od(b[2], razy(b[1], 2)), b[0]), 6 * (1 - t));
  const c = razy(dod(od(b[3], razy(b[2], 2)), b[1]), 6 * t);
  return dod(a, c);
}

function parametryCieciwy(p: Pkt[]): number[] {
  const u = [0];
  for (let i = 1; i < p.length; i++) u.push(u[i - 1] + dlug(od(p[i], p[i - 1])));
  const suma = u[u.length - 1] || 1;
  return u.map((x) => x / suma);
}

function generujBezier(p: Pkt[], u: number[], t1: Pkt, t2: Pkt): Bezier {
  const p0 = p[0];
  const p3 = p[p.length - 1];
  const C = [[0, 0], [0, 0]];
  const X = [0, 0];
  for (let i = 0; i < p.length; i++) {
    const t = u[i];
    const m = 1 - t;
    const a1 = razy(t1, 3 * m * m * t);
    const a2 = razy(t2, 3 * m * t * t);
    C[0][0] += il(a1, a1);
    C[0][1] += il(a1, a2);
    C[1][1] += il(a2, a2);
    const tmp = od(p[i], dod(razy(p0, m * m * m + 3 * m * m * t), razy(p3, 3 * m * t * t + t * t * t)));
    X[0] += il(a1, tmp);
    X[1] += il(a2, tmp);
  }
  C[1][0] = C[0][1];
  const det = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  let alfa1 = det === 0 ? 0 : (X[0] * C[1][1] - X[1] * C[0][1]) / det;
  let alfa2 = det === 0 ? 0 : (C[0][0] * X[1] - C[1][0] * X[0]) / det;
  const dl = dlug(od(p3, p0));
  const eps = 1e-6 * dl;
  if (alfa1 < eps || alfa2 < eps) alfa1 = alfa2 = dl / 3;
  return [p0, dod(p0, razy(t1, alfa1)), dod(p3, razy(t2, alfa2)), p3];
}

function bladMaks(p: Pkt[], b: Bezier, u: number[]): { blad: number; gdzie: number } {
  let blad = 0;
  let gdzie = Math.floor(p.length / 2);
  for (let i = 1; i < p.length - 1; i++) {
    const d = dlug(od(bez(b, u[i]), p[i])) ** 2;
    if (d >= blad) {
      blad = d;
      gdzie = i;
    }
  }
  return { blad, gdzie };
}

function popraw(p: Pkt[], b: Bezier, u: number[]): number[] {
  return u.map((t, i) => {
    const q = od(bez(b, t), p[i]);
    const q1 = bezPochodna(b, t);
    const q2 = bezDruga(b, t);
    const mian = il(q1, q1) + il(q, q2);
    if (Math.abs(mian) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - il(q, q1) / mian));
  });
}

/** Dopasowanie łańcucha punktów krzywymi (styczne końcowe t1 – „do przodu”, t2 – „do tyłu”). */
function dopasuj(p: Pkt[], t1: Pkt, t2: Pkt, tol2: number, wynik: Bezier[], glebokosc = 0): void {
  if (p.length === 2) {
    const d = dlug(od(p[1], p[0])) / 3;
    wynik.push([p[0], dod(p[0], razy(t1, d)), dod(p[1], razy(t2, d)), p[1]]);
    return;
  }
  let u = parametryCieciwy(p);
  let b = generujBezier(p, u, t1, t2);
  let { blad, gdzie } = bladMaks(p, b, u);
  if (blad < tol2) {
    wynik.push(b);
    return;
  }
  if (blad < tol2 * 16) {
    for (let i = 0; i < 6; i++) {
      u = popraw(p, b, u);
      b = generujBezier(p, u, t1, t2);
      ({ blad, gdzie } = bladMaks(p, b, u));
      if (blad < tol2) {
        wynik.push(b);
        return;
      }
    }
  }
  if (glebokosc > 24 || p.length < 4) {
    wynik.push(b);
    return;
  }
  gdzie = Math.min(p.length - 2, Math.max(1, gdzie));
  const tc = norm(od(p[gdzie - 1], p[gdzie + 1]));
  dopasuj(p.slice(0, gdzie + 1), t1, tc, tol2, wynik, glebokosc + 1);
  dopasuj(p.slice(gdzie), razy(tc, -1), t2, tol2, wynik, glebokosc + 1);
}

/** Punkt na konturze w odległości łukowej `s` od indeksu `i` (s < 0 – wstecz). */
function punktNaLuku(k: Pkt[], i: number, s: number): Pkt {
  const n = k.length;
  let j = i;
  let zostalo = Math.abs(s);
  const krok = s < 0 ? -1 : 1;
  for (let g = 0; g < n; g++) {
    const nj = (j + krok + n) % n;
    const d = dlug(od(k[nj], k[j]));
    if (d >= zostalo) return dod(k[j], razy(od(k[nj], k[j]), d < 1e-12 ? 0 : zostalo / d));
    zostalo -= d;
    j = nj;
  }
  return k[j];
}

/** Indeksy narożników: lokalne maksima skrętu > progu (stopnie) na łuku ±r px. */
function narozniki(k: Pkt[], r: number, progStopni: number): number[] {
  const n = k.length;
  const skret = k.map((_, i) => {
    const a = norm(od(k[i], punktNaLuku(k, i, -r)));
    const b = norm(od(punktNaLuku(k, i, r), k[i]));
    return (Math.acos(Math.min(1, Math.max(-1, il(a, b)))) * 180) / Math.PI;
  });
  const okno = Math.max(2, Math.round(r));
  const wynik: number[] = [];
  for (let i = 0; i < n; i++) {
    if (skret[i] < progStopni) continue;
    let maks = true;
    for (let d = 1; d <= okno && maks; d++) {
      if (skret[(i + d) % n] > skret[i] || skret[(i - d + n) % n] >= skret[i]) maks = false;
    }
    if (maks) wynik.push(i);
  }
  return wynik;
}

/** Styczna w punkcie (różnica centralna na łuku ±r). */
function stycznaSrodkowa(k: Pkt[], i: number, r: number): Pkt {
  return norm(od(punktNaLuku(k, i, r), punktNaLuku(k, i, -r)));
}

type Odcinek = { typ: 'L'; p: Pkt } | { typ: 'C'; b: Bezier };

/** Prosta najlepiej dopasowana (PCA) do punktów: środek i kierunek. */
function prostaPca(p: Pkt[]): { c: Pkt; k: Pkt } {
  const c: Pkt = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const q of p) {
    const dx = q[0] - c[0];
    const dy = q[1] - c[1];
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const kat = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c, k: [Math.cos(kat), Math.sin(kat)] };
}

function przeciecie(a: { c: Pkt; k: Pkt }, b: { c: Pkt; k: Pkt }): Pkt | null {
  const det = a.k[0] * b.k[1] - a.k[1] * b.k[0];
  if (Math.abs(det) < 0.2) return null; // prawie równoległe
  const d = od(b.c, a.c);
  const t = (d[0] * b.k[1] - d[1] * b.k[0]) / det;
  return dod(a.c, razy(a.k, t));
}

/**
 * Jeden kontur → odcinki (L/C). Narożnik z marching squares jest ścięty (fazka ok. 0,7 px), więc punkt narożnika
 * między dwiema prostymi poprawiamy na przecięcie prostych dopasowanych do ich wnętrza (bez 1,5 px przy końcach).
 */
function konturNaOdcinki(k: Pkt[], tol: number): { start: Pkt; odcinki: Odcinek[] } {
  const n = k.length;
  const r = 2.5;
  let rogi = narozniki(k, r, 50);
  const gladkie = rogi.length === 0;
  if (gladkie) rogi = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)].filter((x, i, a) => a.indexOf(x) === i);

  // Łańcuchy punktów między kolejnymi narożnikami.
  const lancuchy = rogi.map((a, r2) => {
    const b = rogi[(r2 + 1) % rogi.length];
    const punkty: Pkt[] = [];
    for (let i = a; ; i = (i + 1) % n) {
      punkty.push(k[i]);
      if ((i === b && punkty.length > 1) || punkty.length > n) break;
    }
    if (rogi.length === 1) punkty.push(k[a]);
    const prosty = !gladkie && rdp(punkty, tol).length === 2;
    return { a, b, punkty, prosty };
  });

  // Poprawione położenia narożników (przecięcie sąsiednich prostych).
  const pozycje = rogi.map((i) => k[i]);
  if (!gladkie) {
    const proste = lancuchy.map((l) => {
      if (!l.prosty) return null;
      const dl = l.punkty.length;
      const wnetrze = l.punkty.filter((q) => dlug(od(q, l.punkty[0])) > 1.5 && dlug(od(q, l.punkty[dl - 1])) > 1.5);
      return wnetrze.length >= 2 ? prostaPca(wnetrze) : prostaPca(l.punkty);
    });
    for (let j = 0; j < rogi.length; j++) {
      const przed = proste[(j - 1 + rogi.length) % rogi.length];
      const po = proste[j];
      if (!przed || !po || rogi.length < 2) continue;
      const x = przeciecie(przed, po);
      if (x && dlug(od(x, pozycje[j])) <= 2.5) pozycje[j] = x;
    }
  }

  const odcinki: Odcinek[] = [];
  lancuchy.forEach((l, j) => {
    const start = pozycje[j];
    const koniec = pozycje[(j + 1) % rogi.length];
    if (l.prosty) {
      odcinki.push({ typ: 'L', p: koniec });
      return;
    }
    const punkty = [start, ...l.punkty.slice(1, -1), koniec];
    const t1 = gladkie ? stycznaSrodkowa(k, l.a, r) : norm(od(punktNaLuku(k, l.a, 1.5), k[l.a]));
    const t2 = gladkie ? razy(stycznaSrodkowa(k, l.b, r), -1) : norm(od(punktNaLuku(k, l.b, -1.5), k[l.b]));
    const krzywe: Bezier[] = [];
    dopasuj(punkty, t1, t2, tol * tol, krzywe);
    for (const c of krzywe) {
      // Krzywa prawie prosta → linia (mniej węzłów, ładniejszy kod).
      const cieciwa = od(c[3], c[0]);
      const dl = dlug(cieciwa);
      const odl = (q: Pkt) => (dl < 1e-9 ? dlug(od(q, c[0])) : Math.abs(cieciwa[0] * (c[0][1] - q[1]) - (c[0][0] - q[0]) * cieciwa[1]) / dl);
      if (odl(c[1]) < tol * 0.5 && odl(c[2]) < tol * 0.5) odcinki.push({ typ: 'L', p: c[3] });
      else odcinki.push({ typ: 'C', b: c });
    }
  });
  return { start: pozycje[0], odcinki };
}

function liczba(x: number, miejsca: number): string {
  const m = 10 ** miejsca;
  const r = Math.round(x * m) / m;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Wektoryzacja obrazu RGBA do ścieżek w viewBox 0 0 100 100 (jedna ścieżka evenodd na kolor). */
export function wektoryzuj(piksele: Piksele, szer: number, wys: number, opcje: OpcjeWektoryzacji): WynikWektoryzacji {
  if (piksele.length < szer * wys * 4) throw new Error('Za mało danych pikseli dla podanych wymiarów (RGBA).');
  const kolory = opcje.kolory.filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c)).map((c) => (c.startsWith('#') ? c : `#${c}`).toUpperCase());
  const tol = opcje.tolerancja ?? Math.max(0.5, Math.min(szer, wys) / 200);
  const minPole = opcje.minPole ?? Math.max(4, szer * wys * 0.0002);
  const miejsca = opcje.miejsca ?? 1;
  const margines = opcje.margines ?? 2;
  const pola = polaPrzynaleznosci(piksele, szer, wys, kolory, opcje.tlo ?? null);

  const konturyKolorow = pola.map((pole) => konturyPola(pole, szer, wys).filter((k) => Math.abs(poleKonturu(k)) >= minPole));
  // Obrys treści.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const k of konturyKolorow.flat()) {
    for (const [x, y] of k) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) {
    return { sciezki: [], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>', wezly: 0, przeksztalcenie: { skala: 1, dx: 0, dy: 0 } };
  }
  const bok = Math.max(x1 - x0, y1 - y0, 1e-6);
  const skala = (100 - 2 * margines) / bok;
  const dx = 50 - ((x0 + x1) / 2) * skala;
  const dy = 50 - ((y0 + y1) / 2) * skala;
  const pt = (p: Pkt) => `${liczba(p[0] * skala + dx, miejsca)} ${liczba(p[1] * skala + dy, miejsca)}`;

  const sciezki: SciezkaWektora[] = [];
  kolory.forEach((kolor, i) => {
    const kontury = konturyKolorow[i];
    if (!kontury.length) return;
    const czesci: string[] = [];
    let wezly = 0;
    for (const k of kontury) {
      const { start, odcinki } = konturNaOdcinki(k, tol);
      const s = [`M${pt(start)}`];
      for (const o of odcinki) {
        s.push(o.typ === 'L' ? `L${pt(o.p)}` : `C${pt(o.b[1])} ${pt(o.b[2])} ${pt(o.b[3])}`);
      }
      // Ostatni odcinek kończy się w punkcie startu – „Z” domyka bez powtarzania go.
      if (s.length > 1 && s[s.length - 1].startsWith('L') && s[s.length - 1].slice(1) === pt(start)) s.pop();
      s.push('Z');
      wezly += odcinki.length;
      czesci.push(s.join(''));
    }
    const kanal = opcje.kanaly?.[i] ?? (i === 0 ? 'glowny' : i === 1 ? 'akcent' : 'dodatkowy');
    sciezki.push({ kolor, kanal, d: czesci.join(''), kontury: kontury.length, wezly });
  });

  const fill = (s: SciezkaWektora) => (s.kanal === 'glowny' ? 'currentColor' : s.kanal === 'akcent' ? 'var(--akcent, currentColor)' : s.kolor);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${sciezki.map((s) => `<path fill="${fill(s)}" fill-rule="evenodd" d="${s.d}"/>`).join('')}</svg>`;
  return { sciezki, svg, wezly: sciezki.reduce((s, x) => s + x.wezly, 0), przeksztalcenie: { skala, dx, dy } };
}

// --- Rasteryzacja wyniku (porównanie „Oryginał / Wektor”, testy jakości) ---

/** Spłaszczenie ścieżki M/L/C/Z (bezwzględne, jak z `wektoryzuj`) do wielokątów. */
export function splaszczSciezke(d: string, krokiKrzywej = 16): Pkt[][] {
  const tokeny = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const wielokaty: Pkt[][] = [];
  let biezacy: Pkt[] = [];
  let i = 0;
  let pozycja: Pkt = [0, 0];
  const liczbaZ = () => Number(tokeny[i++]);
  while (i < tokeny.length) {
    const t = tokeny[i++].toUpperCase();
    if (t === 'M') {
      if (biezacy.length > 2) wielokaty.push(biezacy);
      pozycja = [liczbaZ(), liczbaZ()];
      biezacy = [pozycja];
    } else if (t === 'L') {
      pozycja = [liczbaZ(), liczbaZ()];
      biezacy.push(pozycja);
    } else if (t === 'C') {
      const b: Bezier = [pozycja, [liczbaZ(), liczbaZ()], [liczbaZ(), liczbaZ()], [liczbaZ(), liczbaZ()]];
      for (let s = 1; s <= krokiKrzywej; s++) biezacy.push(bez(b, s / krokiKrzywej));
      pozycja = b[3];
    } else if (t === 'Z') {
      if (biezacy.length > 2) wielokaty.push(biezacy);
      biezacy = [];
    }
  }
  if (biezacy.length > 2) wielokaty.push(biezacy);
  return wielokaty;
}

/**
 * Maska (1 = wypełnione, reguła evenodd) ścieżki w viewBox po przekształceniu z powrotem do px źródła –
 * próbkowanie środków pikseli liniami poziomymi.
 */
export function rasteryzujWektor(d: string, szer: number, wys: number, p: { skala: number; dx: number; dy: number } = { skala: 1, dx: 0, dy: 0 }): Uint8Array {
  const maska = new Uint8Array(szer * wys);
  const krawedzie: [number, number, number, number][] = [];
  for (const w of splaszczSciezke(d)) {
    const px = w.map(([x, y]): Pkt => [(x - p.dx) / p.skala, (y - p.dy) / p.skala]);
    for (let i = 0; i < px.length; i++) {
      const a = px[i];
      const b = px[(i + 1) % px.length];
      if (a[1] !== b[1]) krawedzie.push([a[0], a[1], b[0], b[1]]);
    }
  }
  for (let y = 0; y < wys; y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (const [ax, ay, bx, by] of krawedzie) {
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const od2 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const do2 = Math.min(szer - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = od2; x <= do2; x++) maska[y * szer + x] = 1;
    }
  }
  return maska;
}

/** IoU dwóch masek (1 = identyczne). Dwie puste maski = 1. */
export function zgodnoscMasek(a: Uint8Array, b: Uint8Array): number {
  let wspolne = 0;
  let suma = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) wspolne++;
    if (a[i] || b[i]) suma++;
  }
  return suma ? wspolne / suma : 1;
}

/**
 * Porównanie wektora ze źródłem: dla każdego koloru IoU maski źródła (piksele najbliższe temu kolorowi, alfa ≥ 50%)
 * i rasteryzacji ścieżki. Do panelu („Oryginał / Wektor”) i do odrzucenia złej wektoryzacji (np. zdjęcie).
 */
export function porownajWektor(piksele: Piksele, szer: number, wys: number, wynik: WynikWektoryzacji, tlo?: string | null): { kolor: string; iou: number }[] {
  const kolory = wynik.sciezki.map((s) => labZHex(s.kolor));
  const wszyscy = tlo ? [...kolory, labZHex(tlo)] : kolory;
  const maski = kolory.map(() => new Uint8Array(szer * wys));
  for (let i = 0; i < szer * wys; i++) {
    if (piksele[i * 4 + 3] < 128) continue;
    const p = rgbDoOklab(piksele[i * 4], piksele[i * 4 + 1], piksele[i * 4 + 2]);
    let best = -1;
    let bd = Infinity;
    wszyscy.forEach((c, j) => {
      const d = odlegloscLab(p, c);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    if (best >= 0 && best < kolory.length) maski[best][i] = 1;
  }
  return wynik.sciezki.map((s, j) => ({ kolor: s.kolor, iou: Math.round(zgodnoscMasek(maski[j], rasteryzujWektor(s.d, szer, wys, wynik.przeksztalcenie)) * 1000) / 1000 }));
}

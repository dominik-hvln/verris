/**
 * Kreator marki – geometria wektorowa w czystym TypeScript (bez zależności): kontury, obrys linii o stałej grubości,
 * operacje boolowskie na wielokątach i zapis do `d` ścieżki SVG.
 *
 * Po co własne operacje boolowskie: znak musi być „płaski” – same wypełnione ścieżki (fill-rule evenodd), bez masek,
 * clipPath i obrysów (stroke). Plotery tnące folię, grawerki i część drukarni nie rozumieją masek, a obrys zmienia się
 * przy skalowaniu. Dlatego fale wycięte z koła, litera wycięta z kafla czy przeplot pierścieni liczymy tu jako
 * prawdziwe kontury.
 *
 * Algorytm (klasyczny „podział krawędzi + klasyfikacja”): wszystkie krawędzie obu argumentów dzielimy w punktach
 * przecięć, każdy kawałek klasyfikujemy po punktach tuż po lewej i prawej stronie (liczba nawinięć – reguła nonzero
 * dla wejścia), zostawiamy te, po których obu stronach wynik się różni, i składamy je w kontury. Wynik: kontury
 * zewnętrzne o dodatnim polu, otwory o ujemnym, bez nakładania – renderują się tak samo przy evenodd i nonzero.
 *
 * Układ współrzędnych SVG (y w dół). Krzywe są spłaszczane z tolerancją TOLERANCJA (cięciwa vs łuk) – przy znaku
 * 100 jednostek to ok. 0,03 % szerokości, niewidoczne także w druku wielkoformatowym.
 */

export type Pkt = [number, number];
export type Kontur = Pkt[];
export type Ksztalt = Kontur[];

export const TOLERANCJA = 0.03;
const EPS = 1e-9;

export const rad = (st: number) => (st * Math.PI) / 180;

// ───────────────────────── podstawy ─────────────────────────

export function pole(k: Kontur): number {
  let s = 0;
  for (let i = 0, n = k.length; i < n; i++) {
    const a = k[i];
    const b = k[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function poleKsztaltu(k: Ksztalt): number {
  return k.reduce((s, c) => s + pole(c), 0);
}

/** Orientacja „zewnętrzna” (dodatnie pole w układzie y w dół). */
export function zewnetrzny(k: Kontur): Kontur {
  return pole(k) < 0 ? [...k].reverse() : k;
}
export function otwor(k: Kontur): Kontur {
  return pole(k) > 0 ? [...k].reverse() : k;
}

export interface Granice {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function granice(k: Ksztalt): Granice {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of k)
    for (const [x, y] of c) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  if (x0 === Infinity) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

export function mapuj(k: Ksztalt, f: (p: Pkt) => Pkt): Ksztalt {
  return k.map((c) => c.map(f));
}
export const przesun = (k: Ksztalt, dx: number, dy: number) => mapuj(k, ([x, y]) => [x + dx, y + dy]);
export const skaluj = (k: Ksztalt, s: number, sy = s, cx = 0, cy = 0) =>
  mapuj(k, ([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * sy]);
export function obroc(k: Ksztalt, katSt: number, cx = 50, cy = 50): Ksztalt {
  const c = Math.cos(rad(katSt));
  const s = Math.sin(rad(katSt));
  return mapuj(k, ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
export function obrocPkt([x, y]: Pkt, katSt: number, cx = 50, cy = 50): Pkt {
  const c = Math.cos(rad(katSt));
  const s = Math.sin(rad(katSt));
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}
/** Odbicie lustrzane w poziomie (zmienia orientację – przywracamy ją). */
export function odbijX(k: Ksztalt, cx = 50): Ksztalt {
  return k.map((c) => c.map(([x, y]) => [2 * cx - x, y] as Pkt).reverse());
}

/** Wpisuje kształt w prostokąt z zachowaniem proporcji, wyśrodkowany. */
export function dopasuj(k: Ksztalt, x: number, y: number, w: number, h: number, g: Granice = granice(k)): Ksztalt {
  const gw = g.x1 - g.x0 || 1;
  const gh = g.y1 - g.y0 || 1;
  const s = Math.min(w / gw, h / gh);
  const ox = x + (w - gw * s) / 2 - g.x0 * s;
  const oy = y + (h - gh * s) / 2 - g.y0 * s;
  return mapuj(k, ([px, py]) => [px * s + ox, py * s + oy]);
}

// ───────────────────────── prymitywy ─────────────────────────

function krokLuku(r: number, tol = TOLERANCJA) {
  if (r <= tol) return Math.PI / 4;
  return Math.max(2 * Math.acos(1 - tol / r), 0.02);
}

/** Punkty łuku (stopnie, kierunek od a0 do a1 – może być malejący). Wlicza oba końce. */
export function luk(cx: number, cy: number, r: number, a0: number, a1: number, ry = r): Pkt[] {
  const roz = rad(a1 - a0);
  const n = Math.max(2, Math.ceil(Math.abs(roz) / krokLuku(Math.max(r, ry))));
  const pkt: Pkt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0) + (roz * i) / n;
    pkt.push([cx + r * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pkt;
}

export function kolo(cx: number, cy: number, r: number): Kontur {
  const p = luk(cx, cy, r, 0, 360);
  p.pop();
  return p;
}

export function elipsa(cx: number, cy: number, rx: number, ry: number, obrotSt = 0): Kontur {
  const p = luk(cx, cy, rx, 0, 360, ry);
  p.pop();
  if (!obrotSt) return p;
  return p.map((q) => obrocPkt(q, obrotSt, cx, cy));
}

/** Prostokąt (opcjonalnie z zaokrąglonymi narożnikami). */
export function prostokat(x: number, y: number, w: number, h: number, r = 0): Kontur {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr < 0.01)
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  return [
    ...luk(x + w - rr, y + rr, rr, -90, 0),
    ...luk(x + w - rr, y + h - rr, rr, 0, 90),
    ...luk(x + rr, y + h - rr, rr, 90, 180),
    ...luk(x + rr, y + rr, rr, 180, 270),
  ];
}

export function wielokatForemny(cx: number, cy: number, r: number, n: number, obrotSt = -90): Kontur {
  const p: Pkt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rad(obrotSt + (360 * i) / n);
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}

/** Zaokrągla narożniki wielokąta promieniem r (ograniczonym długością krawędzi). */
export function zaokraglij(wierz: Pkt[], r: number): Kontur {
  if (r <= 0.01) return wierz;
  const n = wierz.length;
  const wyn: Pkt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = wierz[(i - 1 + n) % n];
    const p = wierz[i];
    const p1 = wierz[(i + 1) % n];
    const v0 = norm([p0[0] - p[0], p0[1] - p[1]]);
    const v1 = norm([p1[0] - p[0], p1[1] - p[1]]);
    const kos = Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1]));
    const kat = Math.acos(kos);
    if (kat < 1e-3 || Math.PI - kat < 1e-3) {
      wyn.push(p);
      continue;
    }
    const l0 = dl(p0, p);
    const l1 = dl(p1, p);
    let d = r / Math.tan(kat / 2);
    const dmax = Math.min(l0, l1) * 0.5;
    let rr = r;
    if (d > dmax) {
      d = dmax;
      rr = d * Math.tan(kat / 2);
    }
    const a: Pkt = [p[0] + v0[0] * d, p[1] + v0[1] * d];
    const b: Pkt = [p[0] + v1[0] * d, p[1] + v1[1] * d];
    const bis = norm([v0[0] + v1[0], v0[1] + v1[1]]);
    const odl = rr / Math.sin(kat / 2);
    const c: Pkt = [p[0] + bis[0] * odl, p[1] + bis[1] * odl];
    const aa = (Math.atan2(a[1] - c[1], a[0] - c[0]) * 180) / Math.PI;
    let ab = (Math.atan2(b[1] - c[1], b[0] - c[0]) * 180) / Math.PI;
    let roz = ab - aa;
    while (roz > 180) roz -= 360;
    while (roz < -180) roz += 360;
    ab = aa + roz;
    wyn.push(...luk(c[0], c[1], rr, aa, ab));
  }
  return wyn;
}

/** Wsunięcie wielokąta wypukłego o d (krawędzie równolegle do środka) – fasety ze szczelinami. */
export function wsun(w: Pkt[], d: number): Kontur {
  const k = zewnetrzny(w);
  const n = k.length;
  const linie = k.map((a, i) => {
    const b = k[(i + 1) % n];
    const [dx, dy] = norm([b[0] - a[0], b[1] - a[1]]);
    // wnętrze po stronie normalnej (-dy, dx) dla orientacji dodatniej
    const nx = -dy * d;
    const ny = dx * d;
    return { a: [a[0] + nx, a[1] + ny] as Pkt, d: [dx, dy] as Pkt };
  });
  const wyn: Pkt[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = linie[(i - 1 + n) % n];
    const l2 = linie[i];
    const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(den) < 1e-9) {
      wyn.push(l2.a);
      continue;
    }
    const t = ((l2.a[0] - l1.a[0]) * l2.d[1] - (l2.a[1] - l1.a[1]) * l2.d[0]) / den;
    wyn.push([l1.a[0] + l1.d[0] * t, l1.a[1] + l1.d[1] * t]);
  }
  return pole(wyn) > 0 ? wyn : [];
}

export function bezier3(p0: Pkt, p1: Pkt, p2: Pkt, p3: Pkt, bezPierwszego = false): Pkt[] {
  const dlug = dl(p0, p1) + dl(p1, p2) + dl(p2, p3);
  const n = Math.max(6, Math.ceil(dlug / 1.1));
  const w: Pkt[] = [];
  for (let i = bezPierwszego ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    w.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return w;
}

export function bezier2(p0: Pkt, p1: Pkt, p2: Pkt, bezPierwszego = false): Pkt[] {
  const dlug = dl(p0, p1) + dl(p1, p2);
  const n = Math.max(6, Math.ceil(dlug / 1.1));
  const w: Pkt[] = [];
  for (let i = bezPierwszego ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    w.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return w;
}

/** Krzywa parametryczna f(t), t ∈ [0,1] – próbkowana gęsto (do obrysu). */
export function krzywa(f: (t: number) => Pkt, n = 120): Pkt[] {
  const w: Pkt[] = [];
  for (let i = 0; i <= n; i++) w.push(f(i / n));
  return w;
}

/** Fala sinusoidalna od x0 do x1 na wysokości y. */
export function fala(x0: number, x1: number, y: number, amp: number, okres: number, faza = 0): Pkt[] {
  const n = Math.max(24, Math.ceil(Math.abs(x1 - x0) / 0.8));
  return krzywa((t) => {
    const x = x0 + (x1 - x0) * t;
    return [x, y - amp * Math.sin(((x - x0) / okres) * 2 * Math.PI + rad(faza))];
  }, n);
}

/** Łączy kawałki linii w jedną (pomija zdublowane punkty styku). */
export function scal(...czesci: Pkt[][]): Pkt[] {
  const w: Pkt[] = [];
  for (const c of czesci)
    for (const p of c) {
      const ost = w[w.length - 1];
      if (ost && Math.abs(ost[0] - p[0]) < 1e-7 && Math.abs(ost[1] - p[1]) < 1e-7) continue;
      w.push(p);
    }
  return w;
}

function dl(a: Pkt, b: Pkt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function norm(v: Pkt): Pkt {
  const d = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / d, v[1] / d];
}

// ───────────────────────── obrys linii (stroke → kontur) ─────────────────────────

export interface OpcjeObrysu {
  /** Zakończenia otwartych linii. */
  konce?: 'okragle' | 'proste';
  /** Połączenia w ostrych narożnikach. */
  zlacza?: 'okragle' | 'ostre';
  zamknieta?: boolean;
}

const KAT_NAROZNIKA = rad(28);

/**
 * Obrys linii o stałej grubości `w` jako kontury (nakładające się – zawsze przepuść przez `polacz`).
 * Linia jest dzielona w ostrych narożnikach; gładkie kawałki dostają przesunięcie wzdłuż normalnych,
 * narożniki – złącze okrągłe albo ostre (z ograniczeniem długości szpica).
 */
export function obrys(linia: Pkt[], w: number, o: OpcjeObrysu = {}): Ksztalt {
  const h = w / 2;
  const konce = o.konce ?? 'okragle';
  const zlacza = o.zlacza ?? (konce === 'okragle' ? 'okragle' : 'ostre');
  let p = scal(linia);
  if (o.zamknieta && p.length > 2 && dl(p[0], p[p.length - 1]) < 1e-6) p = p.slice(0, -1);
  if (p.length === 1) return [zewnetrzny(kolo(p[0][0], p[0][1], h))];
  if (p.length < 2) return [];
  const n = p.length;
  const zamk = !!o.zamknieta && n > 2;
  const kier = (i: number): Pkt => norm([p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]]);
  const liczbaOdc = zamk ? n : n - 1;
  const d: Pkt[] = [];
  for (let i = 0; i < liczbaOdc; i++) d.push(kier(i));
  const naroznik = (i: number) => {
    // narożnik w wierzchołku i między odcinkiem i-1 i i
    const a = d[(i - 1 + liczbaOdc) % liczbaOdc];
    const b = d[i % liczbaOdc];
    const kos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
    return Math.acos(kos) > KAT_NAROZNIKA;
  };
  const wynik: Ksztalt = [];
  const ostre: number[] = [];
  for (let i = zamk ? 0 : 1; i < (zamk ? n : n - 1); i++) if (naroznik(i)) ostre.push(i);

  if (zamk && ostre.length === 0) {
    // gładka zamknięta (także samoprzecinająca się, np. ósemka): kilka otwartych kawałków zachodzących na siebie
    // o 2 odcinki – proste końce każdego kawałka leżą wewnątrz sąsiada, `polacz` skleja je bez śladu.
    const ile = Math.max(4, Math.ceil(n / 60));
    const wyn: Ksztalt = [];
    for (let k = 0; k < ile; k++) {
      const od = Math.floor((k * n) / ile);
      const doI = Math.floor(((k + 1) * n) / ile) + 2;
      const kaw: Pkt[] = [];
      for (let j = od - 1; j <= doI; j++) kaw.push(p[((j % n) + n) % n]);
      wyn.push(...obrys(kaw, w, { konce: 'proste', zlacza: 'okragle' }));
    }
    return wyn;
  }

  // kawałki między ostrymi narożnikami
  const kawalki: { od: number; doI: number }[] = [];
  if (zamk) {
    for (let k = 0; k < ostre.length; k++) {
      const od = ostre[k];
      const doI = ostre[(k + 1) % ostre.length];
      kawalki.push({ od, doI: doI <= od ? doI + n : doI });
    }
  } else {
    let od = 0;
    for (const c of ostre) {
      kawalki.push({ od, doI: c });
      od = c;
    }
    kawalki.push({ od, doI: n - 1 });
  }
  for (const { od, doI } of kawalki) {
    const lewa: Pkt[] = [];
    const prawa: Pkt[] = [];
    for (let j = od; j <= doI; j++) {
      const i = j % n;
      const dPrzed = j === od ? d[i % liczbaOdc] : d[(i - 1 + liczbaOdc) % liczbaOdc];
      const dPo = j === doI ? d[(i - 1 + liczbaOdc) % liczbaOdc] : d[i % liczbaOdc];
      const [nx, ny] = normalnaWierzch(dPrzed, dPo, h);
      lewa.push([p[i][0] + nx, p[i][1] + ny]);
      prawa.push([p[i][0] - nx, p[i][1] - ny]);
    }
    const kontur: Pkt[] = [...lewa];
    const pocz = !zamk && od === 0;
    const kon = !zamk && doI === n - 1;
    const pk = p[doI % n];
    const pp = p[od % n];
    const dk = d[(doI - 1 + liczbaOdc) % liczbaOdc];
    const dp = d[od % liczbaOdc];
    if (kon && konce === 'okragle') {
      const a = (Math.atan2(dk[1], dk[0]) * 180) / Math.PI;
      kontur.push(...luk(pk[0], pk[1], h, a + 90, a - 90).slice(1, -1));
    }
    kontur.push(...prawa.reverse());
    if (pocz && konce === 'okragle') {
      const a = (Math.atan2(dp[1], dp[0]) * 180) / Math.PI;
      kontur.push(...luk(pp[0], pp[1], h, a - 90, a - 270).slice(1, -1));
    }
    wynik.push(zewnetrzny(kontur));
  }
  // złącza w narożnikach
  for (const i of ostre) {
    const c = p[i];
    if (zlacza === 'okragle') {
      wynik.push(zewnetrzny(kolo(c[0], c[1], h)));
      continue;
    }
    const a = d[(i - 1 + liczbaOdc) % liczbaOdc];
    const b = d[i % liczbaOdc];
    const zw = a[0] * b[1] - a[1] * b[0];
    // zewnętrzna strona zakrętu
    const s = zw > 0 ? -1 : 1;
    const na: Pkt = [-a[1] * h * s, a[0] * h * s];
    const nb: Pkt = [-b[1] * h * s, b[0] * h * s];
    const pa: Pkt = [c[0] + na[0], c[1] + na[1]];
    const pb: Pkt = [c[0] + nb[0], c[1] + nb[1]];
    const bis = norm([na[0] + nb[0], na[1] + nb[1]]);
    const kos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
    const pol = Math.acos(kos) / 2;
    const dlMitry = h / Math.cos(pol);
    if (dlMitry <= h * 4) {
      const m: Pkt = [c[0] + bis[0] * dlMitry, c[1] + bis[1] * dlMitry];
      wynik.push(zewnetrzny([c, pa, m, pb]));
    } else {
      // za ostry szpic – ścięcie
      const m1: Pkt = [pa[0] + a[0] * h * 2, pa[1] + a[1] * h * 2];
      const m2: Pkt = [pb[0] - b[0] * h * 2, pb[1] - b[1] * h * 2];
      wynik.push(zewnetrzny([c, pa, m1, m2, pb]));
    }
  }
  return wynik;
}

function normalnaWierzch(a: Pkt, b: Pkt, h: number): Pkt {
  const na: Pkt = [-a[1], a[0]];
  const nb: Pkt = [-b[1], b[0]];
  const s = norm([na[0] + nb[0], na[1] + nb[1]]);
  const kos = s[0] * nb[0] + s[1] * nb[1];
  const k = h / Math.max(kos, 0.5);
  return [s[0] * k, s[1] * k];
}

// ───────────────────────── operacje boolowskie ─────────────────────────

interface Krawedz {
  a: Pkt;
  b: Pkt;
  zr: 0 | 1;
  podzial: { t: number; p: Pkt }[];
}

function krawedzie(k: Ksztalt, zr: 0 | 1, wyn: Krawedz[]) {
  for (const c of k) {
    const n = c.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const a = c[i];
      const b = c[(i + 1) % n];
      if (Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS) continue;
      wyn.push({ a, b, zr, podzial: [] });
    }
  }
}

function przecinaj(e: Krawedz, f: Krawedz) {
  const rx = e.b[0] - e.a[0];
  const ry = e.b[1] - e.a[1];
  const sx = f.b[0] - f.a[0];
  const sy = f.b[1] - f.a[1];
  const den = rx * sy - ry * sx;
  const qpx = f.a[0] - e.a[0];
  const qpy = f.a[1] - e.a[1];
  const le = Math.hypot(rx, ry);
  const lf = Math.hypot(sx, sy);
  if (Math.abs(den) < 1e-12 * le * lf) {
    // równoległe – sprawdź współliniowość i nakładanie
    const odl = Math.abs(qpx * ry - qpy * rx) / le;
    if (odl > 1e-7) return;
    const rzut = (p: Pkt, a: Pkt, dx: number, dy: number, l2: number) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    for (const p of [f.a, f.b]) {
      const t = rzut(p, e.a, rx, ry, le * le);
      if (t > 1e-9 && t < 1 - 1e-9) e.podzial.push({ t, p });
    }
    for (const p of [e.a, e.b]) {
      const t = rzut(p, f.a, sx, sy, lf * lf);
      if (t > 1e-9 && t < 1 - 1e-9) f.podzial.push({ t, p });
    }
    return;
  }
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  const tolT = 1e-9;
  if (t < -tolT || t > 1 + tolT || u < -tolT || u > 1 + tolT) return;
  const wewT = t > tolT && t < 1 - tolT;
  const wewU = u > tolT && u < 1 - tolT;
  if (!wewT && !wewU) return;
  // punkt wspólny – jeśli to koniec jednej krawędzi, używamy dokładnie tego końca
  let p: Pkt;
  if (!wewU) p = u <= tolT ? f.a : f.b;
  else if (!wewT) p = t <= tolT ? e.a : e.b;
  else p = [e.a[0] + rx * t, e.a[1] + ry * t];
  if (wewT) e.podzial.push({ t, p });
  if (wewU) f.podzial.push({ t: u, p });
}

/** Krawędzie w poziomych pasach (przyspiesza liczenie nawinięć: tylko krawędzie przecinające wysokość punktu). */
interface Pasy {
  y0: number;
  h: number;
  pasy: Krawedz[][];
}

function zbudujPasy(kr: Krawedz[], zr: 0 | 1): Pasy {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const e of kr) {
    if (e.zr !== zr) continue;
    y0 = Math.min(y0, e.a[1], e.b[1]);
    y1 = Math.max(y1, e.a[1], e.b[1]);
  }
  const n = 96;
  if (y0 === Infinity) return { y0: 0, h: 1, pasy: [] };
  const h = (y1 - y0) / n || 1;
  const pasy: Krawedz[][] = Array.from({ length: n }, () => []);
  for (const e of kr) {
    if (e.zr !== zr) continue;
    const i0 = Math.max(0, Math.floor((Math.min(e.a[1], e.b[1]) - y0) / h));
    const i1 = Math.min(n - 1, Math.floor((Math.max(e.a[1], e.b[1]) - y0) / h));
    for (let i = i0; i <= i1; i++) pasy[i].push(e);
  }
  return { y0, h, pasy };
}

function nawinieciaP(p: Pasy, x: number, y: number): number {
  const i = Math.floor((y - p.y0) / p.h);
  if (i < 0 || i >= p.pasy.length) return 0;
  return nawiniecia(p.pasy[i], x, y);
}

function nawiniecia(kr: Krawedz[], x: number, y: number): number {
  let w = 0;
  for (const e of kr) {
    const a = e.a;
    const b = e.b;
    if (a[1] <= y) {
      if (b[1] > y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) > 0) w++;
    } else if (b[1] <= y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) < 0) w--;
  }
  return w;
}

const klucz = (p: Pkt) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

/** Ogólna operacja boolowska: f(wA, wB) mówi, czy punkt należy do wyniku (wA/wB – punkt w A/B wg nonzero). */
export function operacja(
  a: Ksztalt,
  b: Ksztalt,
  f: (wa: boolean, wb: boolean) => boolean,
  o: { parzystoscA?: boolean; parzystoscB?: boolean } = {},
): Ksztalt {
  const wA = (w: number) => (o.parzystoscA ? (w & 1) === 1 : w !== 0);
  const wB = (w: number) => (o.parzystoscB ? (w & 1) === 1 : w !== 0);
  const kr: Krawedz[] = [];
  krawedzie(a, 0, kr);
  krawedzie(b, 1, kr);
  if (!kr.length) return [];
  // przecięcia – zamiatanie po x
  const idx = kr.map((_, i) => i).sort((i, j) => Math.min(kr[i].a[0], kr[i].b[0]) - Math.min(kr[j].a[0], kr[j].b[0]));
  for (let ii = 0; ii < idx.length; ii++) {
    const e = kr[idx[ii]];
    const ex1 = Math.max(e.a[0], e.b[0]) + 1e-9;
    const ey0 = Math.min(e.a[1], e.b[1]) - 1e-9;
    const ey1 = Math.max(e.a[1], e.b[1]) + 1e-9;
    for (let jj = ii + 1; jj < idx.length; jj++) {
      const g = kr[idx[jj]];
      if (Math.min(g.a[0], g.b[0]) > ex1) break;
      if (Math.max(g.a[1], g.b[1]) < ey0 || Math.min(g.a[1], g.b[1]) > ey1) continue;
      przecinaj(e, g);
    }
  }
  // podział i klasyfikacja
  const pasyA = zbudujPasy(kr, 0);
  const pasyB = zbudujPasy(kr, 1);
  const wynik = new Map<string, { a: Pkt; b: Pkt }>();
  const eps = 2e-5;
  for (const e of kr) {
    const pkt: Pkt[] = [e.a];
    e.podzial.sort((x, y) => x.t - y.t);
    for (const s of e.podzial) pkt.push(s.p);
    pkt.push(e.b);
    for (let i = 0; i + 1 < pkt.length; i++) {
      const p0 = pkt[i];
      const p1 = pkt[i + 1];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      const nx = (-dy / l) * eps;
      const ny = (dx / l) * eps;
      const wL = f(wA(nawinieciaP(pasyA, mx + nx, my + ny)), wB(nawinieciaP(pasyB, mx + nx, my + ny)));
      const wP = f(wA(nawinieciaP(pasyA, mx - nx, my - ny)), wB(nawinieciaP(pasyB, mx - nx, my - ny)));
      if (wL === wP) continue;
      const [s0, s1] = wL ? [p0, p1] : [p1, p0];
      const k = klucz(s0) + '|' + klucz(s1);
      const kOdw = klucz(s1) + '|' + klucz(s0);
      if (wynik.has(kOdw)) {
        wynik.delete(kOdw);
        continue;
      }
      wynik.set(k, { a: s0, b: s1 });
    }
  }
  return zlozKontury([...wynik.values()]);
}

function zlozKontury(odc: { a: Pkt; b: Pkt }[]): Ksztalt {
  const wych = new Map<string, number[]>();
  odc.forEach((o, i) => {
    const k = klucz(o.a);
    const l = wych.get(k);
    if (l) l.push(i);
    else wych.set(k, [i]);
  });
  const uzyty = new Uint8Array(odc.length);
  const kontury: Ksztalt = [];
  for (let s = 0; s < odc.length; s++) {
    if (uzyty[s]) continue;
    const k: Pkt[] = [];
    let cur = s;
    const start = klucz(odc[s].a);
    for (let krok = 0; krok < odc.length + 1; krok++) {
      uzyty[cur] = 1;
      k.push(odc[cur].a);
      const kon = klucz(odc[cur].b);
      if (kon === start) break;
      const kand = (wych.get(kon) ?? []).filter((i) => !uzyty[i]);
      if (!kand.length) break;
      let nast = kand[0];
      if (kand.length > 1) {
        // wybór najostrzejszego skrętu w lewo (spójne kontury przy stykających się wierzchołkach)
        const d0 = Math.atan2(odc[cur].b[1] - odc[cur].a[1], odc[cur].b[0] - odc[cur].a[0]);
        let naj = Infinity;
        for (const i of kand) {
          const d1 = Math.atan2(odc[i].b[1] - odc[i].a[1], odc[i].b[0] - odc[i].a[0]);
          let skret = d1 - d0;
          while (skret <= -Math.PI) skret += 2 * Math.PI;
          while (skret > Math.PI) skret -= 2 * Math.PI;
          if (skret < naj) {
            naj = skret;
            nast = i;
          }
        }
      }
      cur = nast;
    }
    const czysty = uprosc(k);
    if (czysty.length >= 3 && Math.abs(pole(czysty)) > 0.02) kontury.push(czysty);
  }
  return kontury;
}

/** Usuwa punkty współliniowe i zdublowane. */
export function uprosc(k: Kontur, tol = 0.004): Kontur {
  let w = k;
  for (let przebieg = 0; przebieg < 2; przebieg++) {
    const n = w.length;
    if (n < 4) return w;
    const nowy: Pkt[] = [];
    for (let i = 0; i < n; i++) {
      const a = nowy.length ? nowy[nowy.length - 1] : w[(i - 1 + n) % n];
      const p = w[i];
      const b = w[(i + 1) % n];
      const l = dl(a, b);
      if (dl(a, p) < 1e-6) continue;
      const odl = l < 1e-9 ? dl(a, p) : Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1])) / l;
      const rzut = l < 1e-9 ? 0 : ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (l * l);
      if (odl < tol && rzut > 0 && rzut < 1) continue;
      nowy.push(p);
    }
    w = nowy;
  }
  return w;
}

export const polacz = (...k: Ksztalt[]): Ksztalt => operacja(k.flat(), [], (a) => a);
export const odejmij = (a: Ksztalt, b: Ksztalt): Ksztalt => operacja(a, b, (x, y) => x && !y);
export const przetnij = (a: Ksztalt, b: Ksztalt): Ksztalt => operacja(a, b, (x, y) => x && y);

// ───────────────────────── zapis SVG ─────────────────────────

const liczba = (x: number, cyfry: number) => {
  const m = 10 ** cyfry;
  let s = String(Math.round(x * m) / m);
  if (s === '-0') s = '0';
  return s;
};

/** `d` ścieżki SVG (współrzędne bezwzględne, M + kolejne pary = L, Z). */
export function doD(k: Ksztalt, cyfry = 2): string {
  const czesci: string[] = [];
  for (const c of k) {
    if (c.length < 3) continue;
    const pary: string[] = [];
    let ost = '';
    for (const [x, y] of c) {
      const s = liczba(x, cyfry) + ' ' + liczba(y, cyfry);
      if (s === ost) continue;
      pary.push(s);
      ost = s;
    }
    if (pary.length >= 3) czesci.push('M' + pary.join(' ') + 'Z');
  }
  return czesci.join('');
}

export const KOLOR_GLOWNY = 'currentColor';
export const KOLOR_AKCENTU = 'var(--akcent, currentColor)';

/** Element `<path>` w kanale głównym albo akcentu (pusty napis dla pustego kształtu). */
export function sciezka(k: Ksztalt, kanal: 'glowny' | 'akcent' = 'glowny'): string {
  const d = doD(k);
  if (!d) return '';
  return `<path fill="${kanal === 'akcent' ? KOLOR_AKCENTU : KOLOR_GLOWNY}" fill-rule="evenodd" d="${d}"/>`;
}

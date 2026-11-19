/**
 * „Gwiazda” – gwiazda wielokątna, iskra (wklęsłe łuki między ramionami) albo rozeta; opcjonalnie wycięty środek.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, bezier2, kolo, obroc, odejmij, polacz, scal, zaokraglij, zewnetrzny, elipsa } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('styl', 'styl: 0 gwiazda, 1 iskra, 2 rozeta', 0, 2, 1),
  par('n', 'liczba ramion', 4, 8, 4),
  par('wc', 'wcięcie (% promienia)', 30, 60, 42),
  par('zaokr', 'zaokrąglenie wierzchołków', 0, 6, 2),
  par('srodek', 'wycięty środek 0/1', 0, 1, 0),
  par('mala', 'druga mała gwiazda (akcent) 0/1', 0, 1, 1),
  par('obrot', 'obrót (stopnie)', 0, 45, 0),
];

function gwiazdaK(cx: number, cy: number, R: number, n: number, wc: number, styl: number, zaokr: number, obr: number): Ksztalt {
  const r = (R * wc) / 100;
  if (styl === 2) {
    // rozeta: n elips wokół środka
    const k: Ksztalt = [];
    for (let i = 0; i < n; i++) k.push(zewnetrzny(elipsa(cx, cy - R * 0.5, R * (0.1 + wc / 500) * (6 / Math.max(n, 4)) ** 0.5, R * 0.5, 0)));
    return polacz(...k.map((e, i) => obroc([e], obr + (360 * i) / n, cx, cy)));
  }
  const pkt: Pkt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((obr - 90 + (360 * i) / n) * Math.PI) / 180;
    const b = ((obr - 90 + (360 * (i + 0.5)) / n) * Math.PI) / 180;
    pkt.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    pkt.push([cx + r * Math.cos(b), cy + r * Math.sin(b)]);
  }
  if (styl === 0) return [zewnetrzny(zaokraglij(pkt, zaokr))];
  // iskra: wklęsłe krzywe między ramionami (punkt kontrolny bliżej środka)
  const wyn: Pkt[][] = [];
  for (let i = 0; i < n; i++) {
    const a = pkt[2 * i];
    const m = pkt[2 * i + 1];
    const b = pkt[(2 * i + 2) % (2 * n)];
    const k: Pkt = [cx + (m[0] - cx) * 0.35, cy + (m[1] - cy) * 0.35];
    wyn.push(bezier2(a, k, b, true));
  }
  return [zewnetrzny(scal(...wyn))];
}

export const gwiazda: RodzinaSygnetu = {
  id: 'gwiazda',
  nazwa: 'Iskra',
  opis: 'Gwiazda, iskra albo rozeta z opcjonalną małą gwiazdą w akcencie – wyróżnienie, jakość, magia.',
  charakter: ['energiczna', 'luksusowa', 'zabawna', 'elegancka', 'odwazna'],
  branze: ['event', 'kosmet', 'beauty', 'sprząt', 'jubil', 'nagrod', 'szkoł', 'kreatyw'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    // iskra tylko 4 albo 6 ramion (nieparzyste wyglądają jak plama), rozeta 4–8
    const n = v.styl === 1 ? (v.n < 6 ? 4 : 6) : v.n;
    // iskra: smukłe ramiona (wcięcie ≤ 40 %), pełna gwiazda – jak w parametrze
    const wc = v.styl === 1 ? Math.min(v.wc, 40) : fav ? Math.max(v.wc, 40) : v.wc;
    const mala = v.mala && !fav;
    const R = mala ? 40 : 46;
    const cx = mala ? 44 : 50;
    const cy = mala ? 54 : 50;
    let k = gwiazdaK(cx, cy, R, n, wc, v.styl, v.zaokr, v.obrot);
    if (v.srodek && !(v.styl === 1 && n > 4)) {
      const r = Math.max(5, R * (v.styl === 2 ? 0.16 : wc / 100) * 0.5);
      k = odejmij(k, [kolo(cx, cy, r)]);
    }
    const warstwy = [{ k }];
    if (mala) {
      const m = gwiazdaK(85, 16, 12, 4, 38, 1, 0, 0);
      return wyjscie([...warstwy, { k: m, kanal: 'akcent' as const }], rozmiarPola(o.wariant));
    }
    return wyjscie(warstwy, rozmiarPola(o.wariant));
  },
};

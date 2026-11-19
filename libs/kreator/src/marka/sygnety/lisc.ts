/**
 * „Liść” – liść (soczewka o asymetrycznych bokach), kropla albo kiełek z dwóch liści; nerwy liścia jako wycięcia
 * (szczeliny), opcjonalnie fala w kropli. Natura, zdrowie, wzrost – ale przetworzone, nie dosłowne.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, bezier3, kolo, obroc, obrys, odejmij, polacz, scal, fala, odbijX, zewnetrzny, luk } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('styl', 'styl: 0 liść, 1 kropla, 2 kiełek (dwa liście)', 0, 2, 0),
  par('szer', 'szerokość (% wysokości)', 40, 70, 54),
  par('nerwy', 'pary nerwów (0 – tylko główny)', 0, 3, 2),
  par('szczel', 'szerokość nerwu', 3, 6, 4),
  par('obrot', 'pochylenie (stopnie)', -40, 40, 30),
  par('akc', 'element w akcencie (kropla/łodyga) 0/1', 0, 1, 1),
];

function lisc(cx: number, top: number, dol: number, szer: number): Pkt[] {
  const h = dol - top;
  const w = szer / 2;
  const prawa = bezier3([cx, top], [cx + w * 1.15, top + h * 0.28], [cx + w * 1.05, top + h * 0.8], [cx, dol]);
  const lewa = bezier3([cx, dol], [cx - w * 1.25, top + h * 0.72], [cx - w * 0.95, top + h * 0.18], [cx, top], true);
  return zewnetrzny(scal(prawa, lewa).slice(0, -1));
}

function kropla(cx: number, top: number, dol: number, szer: number): Pkt[] {
  const r = szer / 2;
  const cy = dol - r;
  const prawa = bezier3([cx, top], [cx + r * 0.25, top + (cy - top) * 0.35], [cx + r, cy - r * 0.9], [cx + r, cy]);
  const dolL = luk(cx, cy, r, 0, 180);
  const lewa = bezier3([cx - r, cy], [cx - r, cy - r * 0.9], [cx - r * 0.25, top + (cy - top) * 0.35], [cx, top], true);
  return zewnetrzny(scal(prawa, dolL, lewa).slice(0, -1));
}

export const liscRodzina: RodzinaSygnetu = {
  id: 'lisc',
  nazwa: 'Liść',
  opis: 'Liść z nerwami wyciętymi szczeliną, kropla z falą albo kiełek – natura, zdrowie, wzrost.',
  charakter: ['naturalna', 'spokojna', 'przyjazna', 'ciepla', 'lokalna'],
  branze: ['eko', 'zdrowie', 'rolnictwo', 'ogrod', 'diet', 'herbat', 'zioł', 'fizjo', 'kosmet naturaln', 'weteryn'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const szczel = fav ? Math.max(v.szczel, 6) : v.szczel;
    const nerwy = fav ? Math.min(v.nerwy, 1) : v.nerwy;
    const szer = (92 * v.szer) / 100;
    if (v.styl === 1) {
      let k: Ksztalt = [kropla(50, 4, 96, szer * 1.35)];
      const akc: Ksztalt = [];
      if (nerwy > 0) {
        const r = (szer * 1.35) / 2;
        const y = 96 - r * 0.95;
        k = odejmij(k, obrys(fala(50 - r - 6, 50 + r + 6, y, 2.5, r * 0.95, 0), szczel + 1, { konce: 'proste' }));
      }
      if (v.akc && !fav) akc.push(kolo(50 + szer * 0.75, 18, 6));
      return wyjscie([{ k }, { k: akc, kanal: 'akcent' }], rozmiarPola(o.wariant));
    }
    const jeden = (cx: number, top: number, dol: number, sz: number, kat: number, zNerwami: boolean, ileNerwow = nerwy): Ksztalt => {
      let k: Ksztalt = [lisc(cx, top, dol, sz)];
      if (zNerwami) {
        const h = dol - top;
        const ciecia: Ksztalt = [];
        // kiełek (bez nerwów bocznych): krótki nerw środkowy wewnątrz liścia; liść: nerw przez całą długość
        if (ileNerwow === 0) ciecia.push(...obrys([[cx, top + h * 0.3], [cx, top + h * 0.78]], szczel, { konce: 'okragle' }));
        else ciecia.push(...obrys([[cx, top + h * 0.2], [cx, dol + 6]], szczel, { konce: 'proste' }));
        for (let i = 0; i < ileNerwow; i++) {
          const y = top + h * (0.42 + (i * 0.4) / Math.max(1, ileNerwow));
          const dx = sz * 0.2;
          ciecia.push(...obrys([[cx, y + dx * 0.55], [cx + dx, y - dx * 0.05]], szczel, { konce: 'okragle' }));
          ciecia.push(...obrys([[cx, y + dx * 0.55], [cx - dx, y - dx * 0.05]], szczel, { konce: 'okragle' }));
        }
        k = odejmij(k, polacz(ciecia));
      }
      return obroc(k, kat, cx, dol);
    };
    if (v.styl === 2) {
      const l = jeden(50, 10, 66, szer * 0.78, 38, nerwy > 0, 0);
      const pr = odbijX(l, 50);
      const lodyga = obrys([[50, 66], [50, 96]], Math.max(6, szczel + 2), { konce: 'okragle' });
      return wyjscie(
        [
          { k: polacz(l, pr) },
          { k: polacz(lodyga), kanal: v.akc ? 'akcent' : 'glowny' },
        ],
        rozmiarPola(o.wariant),
      );
    }
    const l = jeden(50, 4, 90, szer, v.obrot, true);
    const ogonek = v.akc && !fav ? obroc(obrys(bezier3([50, 88], [50, 94], [53, 98], [58, 100]), 5, { konce: 'okragle' }), v.obrot, 50, 90) : [];
    return wyjscie(
      [
        { k: l },
        { k: polacz(ogonek), kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

/**
 * „Kryształ” – romb, szlif brylantowy albo izometryczny sześcian podzielony na fasety ze szczelinami
 * (fasety = wielokąty wypukłe wsunięte o pół szczeliny). Precyzja, wartość, budowanie.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, wsun, zaokraglij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('styl', 'styl: 0 romb, 1 brylant, 2 sześcian', 0, 2, 0),
  par('prop', 'wysokość do szerokości (%)', 90, 150, 120),
  par('przes', 'przesunięcie środka faset', -14, 14, 6),
  par('szczel', 'szczelina między fasetami', 3, 7, 4),
  par('zaokr', 'zaokrąglenie faset', 0, 3, 1),
  par('akc', 'faseta w akcencie (0 brak, 1–3)', 0, 3, 1),
];

function fasety(styl: number, prop: number, przes: number): Pkt[][] {
  if (styl === 1) {
    const w = 100;
    const h = (w * prop) / 150;
    const y0 = 50 - h / 2;
    const yg = y0 + h * 0.3;
    const yk = y0 + h;
    const a: Pkt = [6, yg];
    const b: Pkt = [28, y0];
    const c: Pkt = [72, y0];
    const d: Pkt = [94, yg];
    const m1: Pkt = [38 + przes * 0.4, yg];
    const m2: Pkt = [62 + przes * 0.4, yg];
    const k: Pkt = [50 + przes * 0.3, yk];
    return [
      [a, b, m1],
      [b, c, m2, m1],
      [c, d, m2],
      [a, m1, k],
      [m1, m2, k],
      [m2, d, k],
    ];
  }
  if (styl === 2) {
    // sześcian izometryczny: górna, lewa, prawa ściana
    const r = 46;
    const c: Pkt = [50, 50 + przes * 0.3];
    const v = (st: number): Pkt => [50 + r * Math.cos((st * Math.PI) / 180), 50 + r * Math.sin((st * Math.PI) / 180)];
    return [
      [v(-90), v(-30), c, v(-150)],
      [v(-150), c, v(90), v(150)],
      [c, v(-30), v(30), v(90)],
    ];
  }
  const w = (92 * 100) / prop;
  const h = 92;
  const c: Pkt = [50 + przes * 0.5, 50 - Math.abs(przes) * 0.4];
  const top: Pkt = [50, 50 - h / 2];
  const right: Pkt = [50 + w / 2, 50];
  const bot: Pkt = [50, 50 + h / 2];
  const left: Pkt = [50 - w / 2, 50];
  return [
    [top, right, c],
    [right, bot, c],
    [bot, left, c],
    [left, top, c],
  ];
}

export const krysztal: RodzinaSygnetu = {
  id: 'krysztal',
  nazwa: 'Kryształ',
  opis: 'Romb, brylant albo sześcian z faset rozdzielonych szczelinami – precyzja, wartość, konstrukcja.',
  charakter: ['luksusowa', 'ekspercka', 'nowoczesna', 'techniczna', 'elegancka'],
  branze: ['finanse', 'budownictwo', 'nieruchomosci', 'logistyka', 'jubil', 'inwest', 'deweloper', 'magazyn', 'architekt'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const szczel = fav ? Math.max(v.szczel, 6) : v.szczel;
    const lista = fasety(v.styl, v.prop, v.przes);
    const akcIdx = v.akc ? (v.akc - 1) % lista.length : -1;
    const glowny: Ksztalt = [];
    const akcent: Ksztalt = [];
    lista.forEach((f, i) => {
      const w = wsun(f, szczel / 2);
      if (w.length < 3) return;
      const k = zaokraglij(w, v.zaokr * 1.5);
      (i === akcIdx ? akcent : glowny).push(k);
    });
    return wyjscie(
      [
        { k: glowny },
        { k: akcent, kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

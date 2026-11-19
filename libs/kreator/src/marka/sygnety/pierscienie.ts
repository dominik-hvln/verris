/**
 * „Pierścienie” – 2–3 splecione pierścienie z prawdziwym przeplotem (nad/pod): w miejscu, gdzie pierścień
 * przechodzi pod drugim, jest szczelina wycięta po obrysie górnego pierścienia. Wspólnota, partnerstwo, łączenie.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, kolo, obrys, odejmij, polacz, przetnij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba pierścieni', 2, 3, 2),
  par('grub', 'grubość pierścienia', 6, 12, 9),
  par('nakl', 'nakładanie (% promienia)', 30, 55, 45),
  par('szczel', 'szczelina przeplotu', 3, 6, 4),
  par('uklad', 'układ trzech: 0 w rzędzie, 1 w trójkącie', 0, 1, 1),
  par('akc', 'środkowy/drugi pierścień w akcencie 0/1', 0, 1, 1),
];

interface Pierscien {
  c: Pkt;
  r: number;
}

function przeciecia(a: Pierscien, b: Pierscien): Pkt[] {
  const dx = b.c[0] - a.c[0];
  const dy = b.c[1] - a.c[1];
  const d = Math.hypot(dx, dy);
  if (d > a.r + b.r || d < Math.abs(a.r - b.r) || d < 1e-6) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const mx = a.c[0] + (dx * x) / d;
  const my = a.c[1] + (dy * x) / d;
  return [
    [mx - (dy * h) / d, my + (dx * h) / d],
    [mx + (dy * h) / d, my - (dx * h) / d],
  ];
}

export const pierscienie: RodzinaSygnetu = {
  id: 'pierscienie',
  nazwa: 'Splot',
  opis: 'Splecione pierścienie z przeplotem nad/pod – partnerstwo, wspólnota, łączenie ludzi i usług.',
  charakter: ['elegancka', 'spokojna', 'klasyczna', 'przyjazna', 'ekspercka'],
  branze: ['wydarzenia', 'doradztwo', 'ślub', 'wesel', 'ubezpiecz', 'fundacj', 'stowarzysz', 'mediac', 'konsult'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const grub = fav ? Math.max(v.grub, 10) : v.grub;
    const szczel = fav ? Math.max(v.szczel, 5) : v.szczel;
    const n = fav ? 2 : v.n;
    const r = 30;
    const odl = 2 * r * (1 - v.nakl / 100) + r * 0.25;
    const pier: Pierscien[] =
      n === 2
        ? [
            { c: [50 - odl / 2, 50], r },
            { c: [50 + odl / 2, 50], r },
          ]
        : v.uklad === 0
          ? [
              { c: [50 - odl, 50], r },
              { c: [50, 50], r },
              { c: [50 + odl, 50], r },
            ]
          : [0, 1, 2].map((i) => {
              const a = ((-90 + i * 120) * Math.PI) / 180;
              const rr = odl / Math.sqrt(3);
              return { c: [50 + rr * Math.cos(a), 50 + rr * Math.sin(a) + rr * 0.25] as Pkt, r };
            });
    const ksztalt = (q: Pierscien, w: number): Ksztalt => polacz(obrys(kolo(q.c[0], q.c[1], q.r), w, { zamknieta: true }));
    const pelne = pier.map((q) => ksztalt(q, grub));
    const wynik = [...pelne];
    // przeplot: dla każdej pary – w jednym punkcie przecięcia góra ma A, w drugim B
    for (let i = 0; i < pier.length; i++)
      for (let j = i + 1; j < pier.length; j++) {
        const pk = przeciecia(pier[i], pier[j]);
        pk.forEach((pt, m) => {
          const [gora, dol] = m === 0 ? [i, j] : [j, i];
          const okolica: Ksztalt = [kolo(pt[0], pt[1], grub * 1.6 + szczel)];
          const ciecie = przetnij(ksztalt(pier[gora], grub + 2 * szczel), okolica);
          wynik[dol] = odejmij(wynik[dol], ciecie);
        });
      }
    const akcIdx = v.akc ? (n === 3 && v.uklad === 0 ? 1 : n - 1) : -1;
    return wyjscie(
      wynik.map((k, i) => ({ k, kanal: i === akcIdx ? ('akcent' as const) : ('glowny' as const) })),
      rozmiarPola(o.wariant),
    );
  },
};

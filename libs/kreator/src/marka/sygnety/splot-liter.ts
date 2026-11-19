/**
 * „Splecione litery” – dwie litery (główna i akcent) nachodzące na siebie z przeplotem: po lewej stronie druga
 * litera przechodzi nad pierwszą, po prawej pod nią (szczelina wokół górnej). Jedna litera → splot z pierścieniem.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, granice, kolo, obrys, odejmij, polacz, przesun, przetnij } from '../geometria.ts';
import { ksztaltLitery } from './litery.ts';
import { literyZnaku } from './monogram-linia.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('grub', 'grubość kresek (wysokość = 100)', 12, 22, 15),
  par('nakl', 'nakładanie liter (% szerokości)', 25, 60, 42),
  par('szczel', 'szczelina przeplotu', 4, 9, 6),
  par('przes', 'przesunięcie drugiej litery w pionie', 0, 30, 16),
  par('konce', 'zakończenia: 0 proste, 1 okrągłe', 0, 1, 1),
];

export const splotLiter: RodzinaSygnetu = {
  id: 'splot-liter',
  nazwa: 'Splecione litery',
  opis: 'Dwie litery splecione jak w sygnecie rodowym – jedna w kolorze głównym, druga w akcencie.',
  charakter: ['elegancka', 'luksusowa', 'klasyczna', 'rzemieslnicza', 'przyjazna'],
  branze: ['ślub', 'wesel', 'jubil', 'mod', 'hotel', 'winiar', 'restaur', 'rodzin', 'butik'],
  monogram: true,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const litery = literyZnaku(o.litery, 2);
    const grub = fav ? Math.max(v.grub, 20) : v.grub;
    const szczel = fav ? Math.max(v.szczel, 8) : v.szczel;
    const konce = v.konce ? 'okragle' : 'proste';
    const a = ksztaltLitery(litery[0], grub, { konce });
    const aSzer = ksztaltLitery(litery[0], grub, { konce, poszerz: szczel });
    const ga = granice(a);
    let b: Ksztalt;
    let bSzer: Ksztalt;
    if (litery.length > 1) {
      const dx = ga.x1 - (ga.x1 - ga.x0) * (v.nakl / 100);
      const b0 = ksztaltLitery(litery[1], grub, { konce });
      const gb = granice(b0);
      b = przesun(b0, dx - gb.x0, v.przes);
      bSzer = przesun(ksztaltLitery(litery[1], grub, { konce, poszerz: szczel }), dx - gb.x0, v.przes);
    } else {
      // jedna litera: pierścień wokół, przeplatany
      const cx = (ga.x0 + ga.x1) / 2;
      const cy = (ga.y0 + ga.y1) / 2;
      const r = Math.max(ga.x1 - ga.x0, ga.y1 - ga.y0) * 0.5;
      const gr = fav ? grub : grub * 0.7;
      b = polacz(obrys(kolo(cx, cy, r), gr, { zamknieta: true }));
      bSzer = polacz(obrys(kolo(cx, cy, r), gr + 2 * szczel, { zamknieta: true }));
    }
    const g = granice([...a, ...b]);
    const sx = (g.x0 + g.x1) / 2;
    const lewa: Ksztalt = [[[-500, -500], [sx, -500], [sx, 500], [-500, 500]]];
    // po lewej b nad a (a wycięte), po prawej a nad b (b wycięte)
    const aKon = odejmij(a, przetnij(bSzer, lewa));
    const bKon = odejmij(b, odejmij(aSzer, lewa));
    return wyjscie(
      [
        { k: aKon },
        { k: bKon, kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

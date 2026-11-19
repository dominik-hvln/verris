/**
 * „Kolumna + litera” – litera, której pionowy trzon zastępuje kolumna (głowica, żłobki, baza), jak w planszy
 * „Kolumna” z makiety. Litery bez trzonu (A, C, O…) stają obok kolumny. Porządek, solidność, tradycja.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, granice, polacz, prostokat, przesun } from '../geometria.ts';
import { ksztaltLitery, szkielet } from './litery.ts';
import { literyZnaku } from './monogram-linia.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('zlobki', 'liczba żłobków (trzonów kolumny)', 2, 4, 3),
  par('grub', 'grubość litery (wysokość = 100)', 14, 24, 18),
  par('glowica', 'głowica: 0 prosta płyta, 1 płyta z wałkiem', 0, 1, 0),
  par('szczel', 'odstęp kolumna–litera', 3, 8, 5),
  par('akc', 'litera w kolorze akcentu 0/1', 0, 1, 1),
];

/** Kolumna o wysokości 100 (+ wysięgi), prawa krawędź w x = 0. */
function kolumna(zlobki: number, grub: number, glowica: number, fav: boolean): Ksztalt {
  const plyta = Math.max(fav ? 13 : 9, grub * 0.62);
  const szerTrz = Math.max(fav ? 8 : 5.5, grub * 0.36);
  const odstTrz = Math.max(fav ? 6 : 3.8, grub * 0.2);
  const n = fav ? Math.min(zlobki, 2) : zlobki;
  const szerKol = n * szerTrz + (n - 1) * odstTrz;
  const wysieg = Math.max(4, grub * 0.28);
  const szerPlyty = szerKol + 2 * wysieg;
  const x0 = -szerPlyty;
  const k: Ksztalt = [];
  const odstep = Math.max(fav ? 5 : 2.5, grub * 0.12);
  k.push(prostokat(x0, -grub / 2, szerPlyty, plyta, 1.5));
  k.push(prostokat(x0, 100 + grub / 2 - plyta, szerPlyty, plyta, 1.5));
  let gora = -grub / 2 + plyta + odstep;
  let dol = 100 + grub / 2 - plyta - odstep;
  if (glowica && !fav) {
    const w = plyta * 0.5;
    k.push(prostokat(x0 + wysieg * 0.5, gora, szerPlyty - wysieg, w, w / 2));
    k.push(prostokat(x0 + wysieg * 0.5, dol - w, szerPlyty - wysieg, w, w / 2));
    gora += w + odstep;
    dol -= w + odstep;
  }
  for (let i = 0; i < n; i++) k.push(prostokat(x0 + wysieg + i * (szerTrz + odstTrz), gora, szerTrz, dol - gora));
  return k;
}

export const kolumnaLitera: RodzinaSygnetu = {
  id: 'kolumna-litera',
  nazwa: 'Kolumna',
  opis: 'Litera z kolumną zamiast trzonu (głowica, żłobki, baza) – porządek, zaufanie, tradycja.',
  charakter: ['klasyczna', 'ekspercka', 'elegancka', 'spokojna', 'luksusowa'],
  branze: ['rachunk', 'księgow', 'kancelar', 'prawn', 'notar', 'finans', 'bank', 'ubezpiecz', 'muzeum', 'uczeln', 'architekt'],
  monogram: true,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const [l] = literyZnaku(o.litery, 1);
    const grub = fav ? Math.max(v.grub, 26) : v.grub;
    const szczel = fav ? Math.max(v.szczel, 7) : v.szczel;
    const kol = kolumna(fav ? 2 : v.zlobki, grub, v.glowica, fav);
    // Ł bez trzonu traci ukośnik – stawiamy ją obok kolumny jak litery bez trzonu
    const maTrzon = !!szkielet(l).trzon && l !== 'I' && l !== 'Ł';
    let litera: Ksztalt;
    if (maTrzon) {
      // trzon litery wycięty, reszta litery dosunięta do kolumny ze szczeliną
      litera = ksztaltLitery(l, grub, { konce: 'proste', bezTrzonu: szczel });
      const gl = granice(litera);
      litera = przesun(litera, szczel - gl.x0, 0);
    } else if (l === 'I') {
      litera = [];
    } else {
      litera = ksztaltLitery(l, grub, { konce: 'proste' });
      const gl = granice(litera);
      litera = przesun(litera, grub * 0.55 - gl.x0, 0);
    }
    return wyjscie(
      [
        { k: kol },
        { k: polacz(litera), kanal: v.akc ? 'akcent' : 'glowny' },
      ],
      rozmiarPola(o.wariant, 86),
    );
  },
};

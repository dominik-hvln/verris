/**
 * „Litera w ramie” – litera (kreska stałej grubości) w obrysie koła, kafla, sześciokąta, tarczy albo łuku; rama
 * może być otwarta (przerwa w prawym górnym rogu), litera w kolorze głównym, rama w akcencie albo odwrotnie.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, dopasuj, granice, kolo, odejmij, polacz } from '../geometria.ts';
import { ksztaltLitery } from './litery.ts';
import { literyZnaku } from './monogram-linia.ts';
import { pojemnik } from './ksztalty-ramek.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('ksztalt', 'rama: 0 koło, 1 kafel, 2 sześciokąt, 3 tarcza, 4 łuk', 0, 4, 0),
  par('grub', 'grubość litery (wysokość = 100)', 12, 24, 17),
  par('rama', 'grubość ramy', 4, 9, 6),
  par('otwarta', 'przerwa w ramie 0/1', 0, 1, 0),
  par('konce', 'zakończenia litery: 0 proste, 1 okrągłe', 0, 1, 0),
  par('akc', 'kolory: 0 jeden, 1 rama w akcencie, 2 litera w akcencie', 0, 2, 1),
];

export const literaRama: RodzinaSygnetu = {
  id: 'litera-rama',
  nazwa: 'Litera w ramie',
  opis: 'Inicjał w obrysie koła, kafla, sześciokąta, tarczy albo łuku – pieczęć, godło, solidność.',
  charakter: ['klasyczna', 'ekspercka', 'elegancka', 'lokalna', 'rzemieslnicza'],
  branze: ['kancelar', 'prawn', 'notar', 'rachunk', 'księgow', 'browar', 'piekarn', 'rzemieśl', 'stolar'],
  monogram: true,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const litery = literyZnaku(o.litery, fav ? 1 : 2);
    const rGrub = fav ? Math.max(v.rama, 8) : v.rama;
    const grub = fav ? Math.max(v.grub, 22) : v.grub;
    const konce = v.konce ? 'okragle' : 'proste';
    const zew = pojemnik(v.ksztalt, 0);
    let rama: Ksztalt = odejmij([zew], [pojemnik(v.ksztalt, rGrub)]);
    if (v.otwarta && !fav) rama = odejmij(rama, [kolo(84, 16, 14)]);
    // litery obok siebie, wpisane w pole wewnętrzne (zależnie od kształtu ramy)
    const ks: Ksztalt = [];
    let x = 0;
    for (const l of litery) {
      const k = ksztaltLitery(l, grub, { konce });
      const g = granice(k);
      ks.push(...k.map((c) => c.map(([px, py]) => [px - g.x0 + x, py] as [number, number])));
      x += g.x1 - g.x0 + grub * 0.8;
    }
    const pole = v.ksztalt === 1 ? 50 : v.ksztalt === 3 ? 44 : 46;
    const cy = v.ksztalt === 3 ? 44 : v.ksztalt === 4 ? 56 : 50;
    const gl = granice(ks);
    const s = Math.min(pole / (gl.x1 - gl.x0), (pole * (litery.length > 1 ? 0.8 : 1)) / (gl.y1 - gl.y0));
    const w = (gl.x1 - gl.x0) * s;
    const h = (gl.y1 - gl.y0) * s;
    const litera = dopasuj(ks, 50 - w / 2, cy - h / 2, w, h);
    return wyjscie(
      [
        { k: rama, kanal: v.akc === 1 ? 'akcent' : 'glowny' },
        { k: polacz(litera), kanal: v.akc === 2 ? 'akcent' : 'glowny' },
      ],
      rozmiarPola(o.wariant),
      { x0: 2, y0: 2, x1: 98, y1: 98 },
    );
  },
};

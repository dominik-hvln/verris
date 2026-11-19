/**
 * „Litera z przestrzeni negatywnej” – pełny kształt (koło, kafel, sześciokąt, tarcza, łuk) z literą wyciętą
 * (litera = tło). Opcjonalnie litera „wychodzi” poza kształt (spad) i dzieli go na części, a kropka akcentu
 * domyka kompozycję.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, dopasuj, granice, kolo, odejmij, poleKsztaltu, przesun, przetnij } from '../geometria.ts';
import { ksztaltLitery } from './litery.ts';
import { literyZnaku } from './monogram-linia.ts';
import { pojemnik } from './ksztalty-ramek.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('ksztalt', 'kształt: 0 koło, 1 kafel, 2 sześciokąt, 3 tarcza, 4 łuk', 0, 4, 1),
  par('grub', 'grubość wyciętej litery (wysokość = 100)', 14, 26, 19),
  par('skala', 'wielkość litery (% kształtu)', 48, 66, 56),
  par('konce', 'zakończenia litery: 0 proste, 1 okrągłe', 0, 1, 0),
  par('przes', 'przesunięcie litery w prawo/dół', 0, 8, 0),
  par('kropka', 'kropka akcentu 0/1', 0, 1, 0),
];

export const literaNegatyw: RodzinaSygnetu = {
  id: 'litera-negatyw',
  nazwa: 'Litera w kształcie',
  opis: 'Inicjał wycięty w pełnym kształcie – litera tworzona przez tło. Mocny, zwarty, świetny jako ikona.',
  charakter: ['nowoczesna', 'odwazna', 'minimalistyczna', 'techniczna', 'ekspercka'],
  monogram: true,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const litery = literyZnaku(o.litery, fav ? 1 : 2);
    const grub = fav ? Math.max(v.grub, 22) : v.grub;
    const konce = v.konce ? 'okragle' : 'proste';
    const ks: Ksztalt = [];
    let x = 0;
    for (const l of litery) {
      const k = ksztaltLitery(l, grub, { konce });
      const g = granice(k);
      ks.push(...k.map((c) => c.map(([px, py]) => [px - g.x0 + x, py] as [number, number])));
      x += g.x1 - g.x0 + grub * 0.7;
    }
    const pole = (v.skala * (litery.length > 1 ? 1.12 : 1)) * (fav ? 1.08 : 1);
    const cy = v.ksztalt === 3 ? 45 : v.ksztalt === 4 ? 58 : 50;
    const gl = granice(ks);
    const s = Math.min(pole / (gl.x1 - gl.x0), (pole * (litery.length > 1 ? 0.78 : 1)) / (gl.y1 - gl.y0));
    const w = (gl.x1 - gl.x0) * s;
    const h = (gl.y1 - gl.y0) * s;
    const litera = przesun(dopasuj(ks, 50 - w / 2, cy - h / 2, w, h), v.przes, v.przes);
    let ksztalt = odejmij([pojemnik(v.ksztalt)], litera);
    const kropka: Ksztalt = [];
    if (v.kropka && !fav) {
      const kx = 50 + w / 2 + 8 + v.przes;
      const ky = cy + h / 2 - 4 + v.przes;
      const otoczka: Ksztalt = [kolo(kx, ky, 9.5)];
      // kropka tylko, gdy w całości mieści się w kształcie (inaczej wisiałaby na krawędzi)
      if (Math.abs(poleKsztaltu(przetnij(otoczka, [pojemnik(v.ksztalt, 2)])) - poleKsztaltu(otoczka)) < 0.5) {
        kropka.push(kolo(kx, ky, 5));
        ksztalt = odejmij(ksztalt, [kolo(kx, ky, 9)]);
      }
    }
    return wyjscie(
      [{ k: ksztalt }, { k: kropka, kanal: 'akcent' }],
      rozmiarPola(o.wariant),
      { x0: 2, y0: 2, x1: 98, y1: 98 },
    );
  },
};

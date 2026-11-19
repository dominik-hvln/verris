/**
 * „Fale” – kształt (koło, kafel, łuk) wypełniony pasami rozdzielonymi falistymi szczelinami; pasy na przemian
 * w kolorze głównym i akcencie, amplituda może narastać ku dołowi (głębia, ruch).
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, fala, kolo, luk, obrys, odejmij, polacz, prostokat, przetnij, scal } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('ksztalt', 'kształt: 0 koło, 1 kafel, 2 łuk, 3 kropla', 0, 3, 1),
  par('n', 'liczba pasów', 2, 5, 3),
  par('amp', 'wysokość fali', 2, 7, 4),
  par('narast', 'narastanie fali ku dołowi 0/1', 0, 1, 1),
  par('okres', 'liczba fal na szerokości', 1, 3, 2),
  par('szczel', 'szerokość szczeliny', 4, 9, 6),
  par('akc', 'pasy na przemian w akcencie 0/1', 0, 1, 1),
];

function obrysKsztaltu(k: number): Ksztalt {
  if (k === 0) return [kolo(50, 50, 46)];
  if (k === 1) return [prostokat(5, 5, 90, 90, 22)];
  if (k === 2) return [scal(luk(50, 46, 42, 180, 360), [[92, 96], [8, 96]])];
  // kropla
  return [scal(luk(50, 62, 34, -30, 210), [[50, 4]])];
}

export const fale: RodzinaSygnetu = {
  id: 'fale',
  nazwa: 'Fale',
  opis: 'Kształt wypełniony warstwami fal w dwóch kolorach – głębia, płynność, przepływ.',
  charakter: ['spokojna', 'naturalna', 'nowoczesna', 'przyjazna'],
  branze: ['woda', 'basen', 'hydraul', 'klimaty', 'mor', 'surf', 'pralni', 'spa', 'rejs'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const szczel = fav ? Math.max(v.szczel, 7) : v.szczel;
    const top0 = v.ksztalt === 3 ? 30 : 8;
    // pas co najmniej 11 jednostek (w faviconie 16) – inaczej pasy giną w małym rozmiarze
    let n = fav ? Math.min(v.n, 3) : v.n;
    while (n > 2 && (96 - top0) / n - szczel < (fav ? 16 : 11)) n--;
    const ksz = obrysKsztaltu(v.ksztalt);
    const top = top0;
    const wys = 96 - top;
    const okres = 92 / v.okres;
    const linie: Pkt[][] = [];
    for (let i = 1; i < n; i++) {
      const y = top + (wys * i) / n;
      const amp = Math.min(okres * 0.09, wys / n / 4, v.narast ? (v.amp * (i + 0.5)) / n + 1 : v.amp);
      linie.push(fala(-6, 106, y, amp, okres, 0));
    }
    const ciete = odejmij(ksz, polacz(...linie.map((l) => obrys(l, szczel, { konce: 'proste' }))));
    const nad = (l: Pkt[]): Ksztalt => [[...l, [150, -60], [-60, -60]]];
    const glowny: Ksztalt[] = [];
    const akcent: Ksztalt[] = [];
    let reszta = ciete;
    for (let i = 0; i <= linie.length; i++) {
      const pas = i < linie.length ? przetnij(reszta, nad(linie[i])) : reszta;
      if (i < linie.length) reszta = odejmij(reszta, nad(linie[i]));
      (v.akc && i % 2 === 1 ? akcent : glowny).push(pas);
    }
    return wyjscie(
      [
        { k: glowny.flat() },
        { k: akcent.flat(), kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

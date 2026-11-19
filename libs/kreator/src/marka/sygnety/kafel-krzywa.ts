/**
 * „Kafel” – zaokrąglony kwadrat (albo koło) przecięty płynną krzywą; górna część w kolorze głównym, dolna w akcencie.
 * Dobry jako awatar i ikona aplikacji. Krzywa = sześcienna krzywa Béziera (S), szczelina o stałej szerokości.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, bezier3, kolo, obrys, odejmij, polacz, prostokat, przetnij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('ksztalt', 'kształt: 0 zaokrąglony kwadrat, 1 koło, 2 łuk (okno)', 0, 2, 0),
  par('zaokr', 'zaokrąglenie narożników', 8, 40, 22),
  par('poz', 'wysokość krzywej (%)', 38, 62, 50),
  par('amp', 'wygięcie krzywej', 0, 22, 14),
  par('nach', 'pochylenie krzywej', -12, 12, 6),
  par('szczel', 'szerokość szczeliny', 6, 14, 9),
  par('dwie', 'druga krzywa (trzy pasy) 0/1', 0, 1, 0),
];

export const kafelKrzywa: RodzinaSygnetu = {
  id: 'kafel-krzywa',
  nazwa: 'Kafel',
  opis: 'Kafel przecięty płynną krzywą – dwa (albo trzy) pasy w kolorze głównym i akcencie. Wyrazisty awatar.',
  charakter: ['nowoczesna', 'przyjazna', 'energiczna', 'odwazna'],
  branze: ['aplik', 'studio', 'agencj', 'marketing', 'kawiar', 'sklep'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const szczel = fav ? Math.max(v.szczel, 10) : v.szczel;
    const kafel: Ksztalt =
      v.ksztalt === 1
        ? [kolo(50, 50, 46)]
        : v.ksztalt === 2
          ? [lukOkna()]
          : [prostokat(6, 6, 88, 88, v.zaokr)];
    const krzywa = (y: number, amp: number): Pkt[] =>
      bezier3([-8, y + v.nach], [36, y + v.nach + amp], [64, y - v.nach - amp], [108, y - v.nach]);
    const pozycje = v.dwie && !fav ? [v.poz - 17, v.poz + 13] : [v.poz];
    const linie = pozycje.map((y, i) => krzywa(y, i ? v.amp * 0.8 : v.amp));
    const ciete = odejmij(kafel, polacz(...linie.map((l) => obrys(l, szczel, { konce: 'proste' }))));
    const nad = (l: Pkt[]): Ksztalt => [[...l, [150, -60], [-60, -60]]];
    if (pozycje.length === 1)
      return wyjscie(
        [
          { k: przetnij(ciete, nad(linie[0])) },
          { k: odejmij(ciete, nad(linie[0])), kanal: 'akcent' },
        ],
        rozmiarPola(o.wariant),
      );
    const gora = przetnij(ciete, nad(linie[0]));
    const srodek = odejmij(przetnij(ciete, nad(linie[1])), nad(linie[0]));
    const dol = odejmij(ciete, nad(linie[1]));
    return wyjscie(
      [{ k: polacz(gora, dol) }, { k: srodek, kanal: 'akcent' }],
      rozmiarPola(o.wariant),
    );
  },
};

function lukOkna(): Pkt[] {
  // prostokąt z półkolistą górą: szer. 80, wys. 92
  const pkt: Pkt[] = [];
  const r = 40;
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI + (Math.PI * i) / 48;
    pkt.push([50 + r * Math.cos(a), 4 + r + r * Math.sin(a)]);
  }
  pkt.push([90, 96], [10, 96]);
  return pkt;
}

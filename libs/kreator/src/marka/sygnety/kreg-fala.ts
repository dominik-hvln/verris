/**
 * „Toń” – koło z falami wyciętymi w dolnej części (wzór z makiety). Fale to prawdziwe wycięcia (kontury),
 * pasy między falami mają gwarantowaną grubość (parametr `pas`), więc znak zostaje czytelny w faviconie.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, fala, kolo, obrys, odejmij, polacz, przetnij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba fal', 1, 4, 3),
  par('amp', 'wysokość fali', 1, 6, 4),
  par('g', 'grubość wycięcia fali', 4, 9, 6),
  par('pas', 'grubość pasa między falami', 6, 12, 7),
  par('okres', 'liczba fal na średnicy', 1, 3, 2),
  par('poz', 'wysokość pierwszej fali (% średnicy)', 35, 62, 52),
  par('akc', 'dolna część w kolorze akcentu (0/1)', 0, 1, 0),
];

export const kregFala: RodzinaSygnetu = {
  id: 'kreg-fala',
  nazwa: 'Toń',
  opis: 'Koło z 1–4 falami wyciętymi w dolnej części; spokojne, wodne, czytelne nawet jako favicon.',
  charakter: ['spokojna', 'naturalna', 'przyjazna', 'minimalistyczna'],
  branze: ['woda', 'żegl', 'basen', 'spa', 'rejs', 'hydraul', 'jezior', 'mor', 'turyst', 'kajak'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const R = 46;
    let n = v.n;
    let g = v.g;
    let pas = v.pas;
    if (fav) {
      n = Math.min(n, 2);
      g = Math.max(g, 7.5);
      pas = Math.max(pas, 10);
    }
    const okres = (2 * R) / v.okres;
    // fala nie stromsza niż ok. 30° – pasy między falami zachowują grubość w poprzek
    const amp = Math.min(v.amp, okres * 0.09);
    const y0 = 50 - R + (2 * R * v.poz) / 100;
    const linie: Pkt[][] = [];
    for (let i = 0; i < n; i++) {
      const y = y0 + i * (g + pas);
      // ostatni pas pod falą musi mieć co najmniej `pas` grubości
      if (y + g / 2 + amp + pas * 0.8 > 50 + R) break;
      linie.push(fala(50 - R - 12, 50 + R + 12, y, amp, okres, 0));
    }
    const krag: Ksztalt = [kolo(50, 50, R)];
    const ciecia = polacz(...linie.map((l) => obrys(l, g, { konce: 'proste' })));
    const znak = odejmij(krag, ciecia);
    if (!v.akc || !linie.length) return wyjscie([{ k: znak }], rozmiarPola(o.wariant));
    const nad: Ksztalt = [[...linie[0], [150, -50], [-50, -50]]];
    return wyjscie(
      [
        { k: przetnij(znak, nad) },
        { k: odejmij(znak, nad), kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

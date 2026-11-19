/**
 * „Promienie” – słońce / wybuch: krąg (albo pół kręgu – wschód) i promienie o stałej grubości lub zwężane.
 * Liczba promieni ograniczana tak, by między nimi zawsze był prześwit czytelny w małym rozmiarze.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, kolo, luk, obrys, polacz, scal, zaokraglij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba promieni', 6, 16, 10),
  par('rdzen', 'promień tarczy', 12, 26, 18),
  par('dl', 'długość promienia', 10, 24, 16),
  par('grub', 'grubość promienia', 5, 10, 7),
  par('ksztalt', 'promień: 0 zaokrąglona kreska, 1 klin, 2 prosta kreska', 0, 2, 0),
  par('pol', 'tylko górna połowa (wschód) 0/1', 0, 1, 0),
  par('obrot', 'obrót promieni (stopnie)', 0, 30, 0),
  par('akc', 'tarcza w kolorze akcentu 0/1', 0, 1, 1),
];

export const promienie: RodzinaSygnetu = {
  id: 'promienie',
  nazwa: 'Promienie',
  opis: 'Tarcza słońca z promieniami (pełne albo wschód nad linią horyzontu) – energia, ciepło, optymizm.',
  charakter: ['energiczna', 'ciepla', 'przyjazna', 'odwazna', 'zabawna'],
  branze: ['fotowolt', 'energ', 'turyst', 'kawiar', 'przedszkol', 'opalan', 'wakac', 'piekarn'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const grub = fav ? Math.max(v.grub, 9) : v.grub;
    const rdzen = fav ? Math.max(v.rdzen, 20) : v.rdzen;
    const prze = Math.max(5, grub * 0.7);
    const ri = rdzen + prze;
    const dl = Math.max(v.dl, grub * 1.6);
    // prześwit między promieniami na wewnętrznym promieniu co najmniej grub * 0.9 (w faviconie 1.3)
    const zakres = v.pol ? 180 : 360;
    let n = v.n;
    const minKat = ((grub * (fav ? 2.4 : 1.9)) / ri) * (180 / Math.PI);
    while (n > 4 && zakres / n < minKat) n--;
    if (v.pol) n = Math.max(3, Math.round(n / 2) + 1);
    const promienie: Ksztalt = [];
    for (let i = 0; i < n; i++) {
      const a = v.pol ? -168 + (156 * i) / (n - 1) : v.obrot - 90 + (360 * i) / n;
      const c = Math.cos((a * Math.PI) / 180);
      const s = Math.sin((a * Math.PI) / 180);
      const p0: Pkt = [50 + c * (ri + grub / 2), 50 + s * (ri + grub / 2)];
      const p1: Pkt = [50 + c * (ri + dl - grub / 2), 50 + s * (ri + dl - grub / 2)];
      if (v.ksztalt === 1) {
        const w0 = grub * 0.75;
        const w1 = grub * 1.35;
        const q0: Pkt = [50 + c * ri, 50 + s * ri];
        const q1: Pkt = [50 + c * (ri + dl), 50 + s * (ri + dl)];
        promienie.push(
          zaokraglij(
            [
              [q0[0] - s * w0 / 2, q0[1] + c * w0 / 2],
              [q1[0] - s * w1 / 2, q1[1] + c * w1 / 2],
              [q1[0] + s * w1 / 2, q1[1] - c * w1 / 2],
              [q0[0] + s * w0 / 2, q0[1] - c * w0 / 2],
            ],
            1.2,
          ),
        );
      } else {
        promienie.push(...obrys([p0, p1], grub, { konce: v.ksztalt === 0 ? 'okragle' : 'proste' }));
      }
    }
    let tarcza: Ksztalt = [kolo(50, 50, rdzen)];
    let prom = polacz(promienie);
    if (v.pol) {
      tarcza = [scal(luk(50, 50, rdzen, 180, 360))];
      const horyzont = obrys(
        [
          [50 - ri - dl, 50 + prze + grub / 2],
          [50 + ri + dl, 50 + prze + grub / 2],
        ],
        grub,
        { konce: v.ksztalt === 0 ? 'okragle' : 'proste' },
      );
      prom = polacz(prom, horyzont);
    }
    return wyjscie(
      [
        { k: prom },
        { k: tarcza, kanal: v.akc ? 'akcent' : 'glowny' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

/**
 * „Siatka kropek” – kropki w siatce n×n z wycięciem (brakujące kropki tworzą kształt), opcjonalnie skala
 * kropek narastająca po przekątnej albo od środka; jedna kropka może być akcentem.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, kolo, prostokat, wielokatForemny, zaokraglij } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba kropek w rzędzie', 3, 5, 4),
  par('rozm', 'wielkość kropki (% oczka)', 62, 88, 74),
  par('ksztalt', 'kształt: 0 koło, 1 zaokrąglony kwadrat, 2 romb', 0, 2, 0),
  par('wzor', 'wycięcie: 0 brak, 1 przekątna, 2 narożnik, 3 środek, 4 trójkąt, 5 krzyż', 0, 5, 2),
  par('skala', 'skala: 0 równa, 1 po przekątnej, 2 od środka', 0, 2, 0),
  par('akc', 'kropka akcentu: 0 brak, 1 narożnik, 2 środek', 0, 2, 1),
];

function wycieta(wzor: number, n: number, i: number, j: number): boolean {
  const s = (n - 1) / 2;
  switch (wzor) {
    case 1:
      return i === j;
    case 2:
      return (i === n - 1 && j <= 1) || (i === n - 2 && j === 0);
    case 3:
      return Math.abs(i - s) < 0.6 && Math.abs(j - s) < 0.6;
    case 4:
      return i - j >= n - 2;
    case 5:
      return Math.abs(i - s) < 0.6 || Math.abs(j - s) < 0.6;
    default:
      return false;
  }
}

export const siatkaKropek: RodzinaSygnetu = {
  id: 'siatka-kropek',
  nazwa: 'Siatka',
  opis: 'Kropki w siatce z wycięciem – brakujące kropki tworzą kształt. Porządek, dane, technologia.',
  charakter: ['techniczna', 'nowoczesna', 'minimalistyczna', 'ekspercka', 'zabawna'],
  branze: ['IT', 'informat', 'dane', 'analit', 'drukarn', 'program', 'aplik', 'architekt'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const n = fav ? 3 : v.n;
    // krzyż w 3×3 zostawia 4 kropki – w faviconie (i siatce parzystej) zamieniamy na wycięty środek
    const wzor = v.wzor === 5 && (n % 2 === 0 || fav) ? 3 : v.wzor;
    const oczko = 92 / n;
    const glowny: Ksztalt = [];
    const akcent: Ksztalt = [];
    const s = (n - 1) / 2;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        if (wycieta(wzor, n, i, j)) continue;
        let f = v.rozm / 100;
        if (fav) f = Math.max(f, 0.74);
        if (v.skala === 1 && !fav) f *= 0.62 + (0.38 * (i + (n - 1 - j))) / (2 * (n - 1));
        if (v.skala === 2 && !fav) f *= 1 - (0.36 * Math.hypot(i - s, j - s)) / Math.hypot(s, s);
        const r = (oczko * f) / 2;
        const cx = 4 + oczko * (i + 0.5);
        const cy = 4 + oczko * (j + 0.5);
        const k =
          v.ksztalt === 1
            ? prostokat(cx - r, cy - r, 2 * r, 2 * r, r * 0.42)
            : v.ksztalt === 2
              ? zaokraglij(wielokatForemny(cx, cy, r * 1.22, 4, -90), r * 0.18)
              : kolo(cx, cy, r);
        const czyAkc =
          (v.akc === 1 && i === n - 1 && j === 0 && !wycieta(wzor, n, i, j)) ||
          (v.akc === 1 && wycieta(wzor, n, n - 1, 0) && i === n - 1 && j === n - 1) ||
          (v.akc === 2 && Math.abs(i - s) < 0.6 && Math.abs(j - s) < 0.6);
        (czyAkc ? akcent : glowny).push(k);
      }
    // pole zawsze 4–96 (nawet gdy wycięty narożnik) – stała wielkość w lockupie
    return wyjscie(
      [
        { k: glowny },
        { k: akcent, kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
      { x0: 4, y0: 4, x1: 96, y1: 96 },
    );
  },
};

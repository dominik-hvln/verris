/**
 * „Horyzont” – słońce (półkole albo koło) nad falami, które skracają się ku dołowi (wzór z makiety „Horyzont”).
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, fala, kolo, luk, obrys, odejmij, polacz, scal } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba fal', 1, 4, 3),
  par('r', 'promień słońca', 18, 28, 24),
  par('grub', 'grubość fali', 5, 9, 7),
  par('amp', 'wysokość fali', 2, 5, 3),
  par('skrot', 'skracanie fal: 0 równe, 1 do środka, 2 schodkowo w prawo', 0, 2, 1),
  par('pelne', 'słońce: 0 półkole, 1 koło wynurzone', 0, 1, 0),
  par('akc', 'słońce w akcencie 0/1', 0, 1, 1),
];

export const slonceWoda: RodzinaSygnetu = {
  id: 'slonce-woda',
  nazwa: 'Horyzont',
  opis: 'Słońce nad falami, które skracają się ku dołowi – pogodny, prosty znak wypoczynku i natury.',
  charakter: ['spokojna', 'ciepla', 'przyjazna', 'naturalna', 'lokalna'],
  branze: ['turyst', 'pensjonat', 'hotel', 'camping', 'żegl', 'mor', 'jezior', 'wakac', 'agroturyst', 'kemping'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const n = fav ? Math.min(v.n, 2) : v.n;
    const grub = fav ? Math.max(v.grub, 9) : v.grub;
    const okresF = 26 + v.r * 0.2;
    const amp = Math.min(v.amp, okresF * 0.12);
    const odst = grub + 2 * amp + (fav ? 6 : 4.5);
    const r = v.r;
    const baza = 50;
    const slonce: Ksztalt = v.pelne
      ? odejmij([kolo(50, baza - r * 0.35, r)], [[[0, baza + grub / 2 - r * 0.35 + 3], [100, baza + grub / 2 - r * 0.35 + 3], [100, 120], [0, 120]] as Pkt[]])
      : [scal(luk(50, baza, r, 180, 360))];
    const okres = okresF;
    const linie: Ksztalt = [];
    const szer0 = 2 * r + 30;
    for (let i = 0; i < n; i++) {
      const y = baza + (fav ? 9 : 7) + grub / 2 + i * odst;
      let x0 = 50 - szer0 / 2;
      let x1 = 50 + szer0 / 2;
      if (v.skrot === 1) {
        x0 += i * okres * 0.5;
        x1 -= i * okres * 0.5;
      } else if (v.skrot === 2) {
        x0 += i * okres * 0.5;
      }
      if (x1 - x0 < okres * 0.8) break;
      // faza liczona od x = 0 – wszystkie fale w tej samej fazie (równoległe)
      linie.push(...obrys(fala(x0, x1, y, amp, okres, (x0 / okres) * 360), grub, { konce: 'okragle' }));
    }
    return wyjscie(
      [
        { k: slonce, kanal: v.akc ? 'akcent' : 'glowny' },
        { k: polacz(linie) },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

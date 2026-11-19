/**
 * „Góry” – dwa albo trzy szczyty z zaokrągleniem, przedni szczyt odcięty szczeliną od tylnego, opcjonalnie śnieg
 * (wycięta linia łamana), słońce i rama (koło / kafel). Cel, wysiłek, przygoda.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, kolo, obrys, odejmij, polacz, prostokat, przetnij, zaokraglij, zewnetrzny } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba szczytów', 2, 3, 2),
  par('stromosc', 'stromość (%)', 70, 130, 100),
  par('zaokr', 'zaokrąglenie szczytów', 0, 6, 2),
  par('snieg', 'linia śniegu 0/1', 0, 1, 1),
  par('slonce', 'słońce (akcent) 0/1', 0, 1, 1),
  par('rama', 'rama: 0 brak, 1 koło, 2 kafel', 0, 2, 1),
  par('szczel', 'szczelina między szczytami', 3, 6, 4),
];

function szczyt(cx: number, wys: number, pol: number, baza: number, zaokr: number): Pkt[] {
  return zewnetrzny(
    zaokraglij(
      [
        [cx - pol, baza],
        [cx, baza - wys],
        [cx + pol, baza],
      ],
      zaokr,
    ),
  );
}

export const gory: RodzinaSygnetu = {
  id: 'gory',
  nazwa: 'Szczyt',
  opis: 'Szczyty górskie ze śniegiem i słońcem, w ramie albo wolne – cel, wytrwałość, przygoda.',
  charakter: ['odwazna', 'naturalna', 'energiczna', 'ekspercka', 'lokalna'],
  branze: ['sport', 'turystyka', 'górsk', 'trener', 'coach', 'outdoor', 'narty', 'agroturyst', 'schronisk', 'wspinac'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const szczel = fav ? Math.max(v.szczel, 6) : v.szczel;
    const st = v.stromosc / 100;
    const baza = v.rama ? 76 : 86;
    const zaokr = v.zaokr * 1.5 + (fav ? 2 : 0);
    const wysTyl = 54 * st;
    const tyl = szczyt(40, wysTyl, 38, baza, zaokr);
    const przod = szczyt(66, 36 * st, 30, baza, zaokr);
    const odciecie = (k: Pkt[]) => polacz(obrys(k, szczel * 2, { zamknieta: true, zlacza: 'ostre' }), [k]);
    let tylK: Ksztalt = odejmij([tyl], odciecie(przod));
    const elementy: Ksztalt[] = [];
    if (v.n === 3 && !fav) elementy.push(odejmij([szczyt(14, 26 * st, 20, baza, zaokr)], odciecie(tyl)));
    if (v.snieg && !fav) {
      // czapa śniegu: zygzak (3 ząbki) przez całą szerokość szczytu na 40% jego wysokości
      const ys = baza - wysTyl * 0.6;
      const pol = 38 * 0.4 + 2;
      const zab = pol / 2;
      const zyg: Pkt[] = [
        [40 - pol - 4, ys - 3],
        [40 - zab, ys + 5],
        [40, ys - 1],
        [40 + zab, ys + 5],
        [40 + pol + 4, ys - 3],
      ];
      tylK = odejmij(tylK, obrys(zyg, Math.max(3.5, szczel), { konce: 'proste', zlacza: 'ostre' }));
    }
    elementy.push(tylK, [przod]);
    let wszystko = polacz(...elementy);
    const sx = v.rama ? 70 : 78;
    const sy = v.rama ? 30 : 20;
    const sr = fav ? 9 : 8;
    const slonce: Ksztalt = v.slonce ? [kolo(sx, sy, sr)] : [];
    if (v.slonce) wszystko = odejmij(wszystko, [kolo(sx, sy, sr + szczel)]);
    if (!v.rama)
      return wyjscie([{ k: wszystko }, { k: slonce, kanal: 'akcent' }], rozmiarPola(o.wariant));
    // rama: obwódka + góry w środku + pas ziemi u dołu (całość w kolorze głównym)
    const gr = fav ? 8 : 6;
    const zew: Ksztalt = v.rama === 1 ? [kolo(50, 50, 46)] : [prostokat(5, 5, 90, 90, 20)];
    const wnetrze: Ksztalt = v.rama === 1 ? [kolo(50, 50, 46 - gr)] : [prostokat(5 + gr, 5 + gr, 90 - 2 * gr, 90 - 2 * gr, 20 - gr)];
    const wewn = wnetrze;
    const ziemia = przetnij(wewn, [prostokat(0, baza + szczel, 100, 40)]);
    const gory = przetnij(wszystko, wewn);
    return wyjscie(
      [{ k: polacz(odejmij(zew, wnetrze), gory, ziemia) }, { k: slonce, kanal: 'akcent' }],
      rozmiarPola(o.wariant),
    );
  },
};

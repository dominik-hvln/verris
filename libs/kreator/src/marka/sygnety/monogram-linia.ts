/**
 * „Monogram z linii” – 1–2 litery z kreski o stałej grubości (własne szkielety liter, nie font), z akcentem:
 * kropka, podkreślenie albo druga litera w kolorze akcentu; opcjonalnie cienka rama.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, kolo, granice, obrys, odejmij, polacz, prostokat, dopasuj } from '../geometria.ts';
import { ksztaltLitery, normalizujLitery } from './litery.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('grub', 'grubość kreski (wysokość litery = 100)', 10, 24, 16),
  par('konce', 'zakończenia: 0 proste, 1 okrągłe', 0, 1, 1),
  par('akcent', 'akcent: 0 brak, 1 kropka, 2 podkreślenie, 3 druga litera', 0, 3, 1),
  par('rama', 'rama: 0 brak, 1 koło, 2 kafel', 0, 2, 0),
];

/** Litery monogramu z `o.litery` (znormalizowane); brak obsługiwanych → „V” (wywołujący podaje inicjały nazwy). */
export function literyZnaku(litery: string | undefined, ile: number): string[] {
  const l = normalizujLitery(litery, ile);
  return l.length ? l : ['V'];
}

export const monogramLinia: RodzinaSygnetu = {
  id: 'monogram-linia',
  nazwa: 'Monogram',
  opis: 'Inicjały z kreski o stałej grubości z kropką, podkreśleniem albo drugą literą w akcencie.',
  charakter: ['nowoczesna', 'minimalistyczna', 'przyjazna', 'ekspercka', 'elegancka'],
  branze: ['uroda', 'doradztwo', 'it', 'nieruchomosci', 'zdrowie', 'architekt'],
  monogram: true,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    // favicon: jedna litera (dwie w 16 px zlewają się)
    const litery = literyZnaku(o.litery, fav ? 1 : 2);
    const grub = fav ? Math.max(v.grub, 20) : v.grub;
    const konce = v.konce ? 'okragle' : 'proste';
    const odstep = grub * 1.0;
    const ksztalty: Ksztalt[] = [];
    let x = 0;
    for (const l of litery) {
      const k = ksztaltLitery(l, grub, { konce });
      const g = granice(k);
      ksztalty.push(k.map((c) => c.map(([px, py]) => [px - g.x0 + x, py] as [number, number])));
      x += g.x1 - g.x0 + odstep;
    }
    const wszystkie = ksztalty.flat();
    const g = granice(wszystkie);
    let glowny: Ksztalt = v.akcent === 3 && ksztalty.length > 1 ? ksztalty[0] : wszystkie;
    const akcent: Ksztalt = [];
    if (v.akcent === 3 && ksztalty.length > 1) akcent.push(...ksztalty[1]);
    if (v.akcent === 1 || (v.akcent === 3 && ksztalty.length < 2)) {
      const r = grub * 0.75;
      akcent.push(kolo(g.x1 + r + grub * 0.55, 100 + grub / 2 - r, r));
    }
    if (v.akcent === 2) akcent.push(...obrys([[g.x0 + grub / 2, 100 + grub * 1.6], [g.x1 - grub / 2, 100 + grub * 1.6]], grub * 0.8, { konce }));
    if (!v.rama) return wyjscie([{ k: glowny }, { k: akcent, kanal: 'akcent' }], rozmiarPola(o.wariant));
    // rama: litery wpisane w koło/kafel o cienkiej obwódce
    const gr = Math.max(5, (fav ? 7 : 4.5));
    const rama: Ksztalt =
      v.rama === 1
        ? odejmij([kolo(50, 50, 46)], [kolo(50, 50, 46 - gr)])
        : odejmij([prostokat(5, 5, 90, 90, 22)], [prostokat(5 + gr, 5 + gr, 90 - 2 * gr, 90 - 2 * gr, 22 - gr)]);
    const pole = v.rama === 1 ? 46 : 52;
    const gc = granice([...glowny, ...akcent]);
    const tr = (k: Ksztalt) => dopasuj(k, 50 - pole / 2, 50 - pole / 2, pole, pole, gc);
    glowny = tr(glowny);
    return wyjscie(
      [{ k: polacz(rama, glowny) }, { k: tr(akcent), kanal: 'akcent' }],
      rozmiarPola(o.wariant),
      { x0: 4, y0: 4, x1: 96, y1: 96 },
    );
  },
};

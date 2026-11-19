/**
 * „Brama” – łuk architektoniczny: pełny łuk (drzwi/okno) z zagnieżdżonymi łukami o stałej grubości, podziałami
 * i słońcem/kluczem w akcencie. Łuk półkolisty albo ostry (gotycki). Dom, miejsce, tradycja – bez kliszy „domku”.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, kolo, luk, obrys, odejmij, polacz, scal, przetnij, zewnetrzny } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('typ', 'łuk: 0 półkolisty, 1 ostry, 2 płaski z zaokrągleniem', 0, 2, 0),
  par('n', 'liczba łuków-obramowań', 1, 3, 2),
  par('grub', 'grubość obramowania', 6, 11, 8),
  par('prop', 'wysokość do szerokości (%)', 110, 150, 125),
  par('srodek', 'środek: 0 pełny łuk, 1 słońce, 2 podział na pół, 3 pusty', 0, 3, 1),
  par('akc', 'środek w akcencie 0/1', 0, 1, 1),
];

/** Linia środkowa łuku (otwarta u dołu): od lewego dołu, przez górę, do prawego dołu. */
function liniaLuku(typ: number, x0: number, x1: number, gora: number, dol: number): Pkt[] {
  const w = x1 - x0;
  const r = w / 2;
  const cx = (x0 + x1) / 2;
  if (typ === 1) {
    // ostry: dwa łuki o promieniu 0.8 w, środki przesunięte
    const R = w * 0.8;
    const cyL = gora + Math.sqrt(R * R - (R - r) ** 2);
    const aL = (Math.atan2(gora - cyL, cx - (x0 + R)) * 180) / Math.PI;
    const aP = (Math.atan2(gora - cyL, cx - (x1 - R)) * 180) / Math.PI;
    return scal([[x0, dol]], luk(x0 + R, cyL, R, 180, 360 + aL), luk(x1 - R, cyL, R, aP, 0), [[x1, dol]]);
  }
  if (typ === 2) {
    const rr = r * 0.55;
    return scal([[x0, dol]], luk(x0 + rr, gora + rr, rr, 180, 270), luk(x1 - rr, gora + rr, rr, 270, 360), [[x1, dol]]);
  }
  return scal([[x0, dol]], luk(cx, gora + r, r, 180, 360), [[x1, dol]]);
}

export const lukOkno: RodzinaSygnetu = {
  id: 'luk-okno',
  nazwa: 'Brama',
  opis: 'Łuk bramy lub okna z zagnieżdżonymi obramowaniami i słońcem w środku – miejsce, gościnność, tradycja.',
  charakter: ['klasyczna', 'elegancka', 'spokojna', 'lokalna', 'luksusowa'],
  branze: ['nieruchomosci', 'turystyka', 'gastronomia', 'kultura', 'hotel', 'pensjonat', 'architekt', 'wnętrz', 'piec', 'restaur', 'winiar'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const grub = fav ? Math.max(v.grub, 10) : v.grub;
    const szczel = fav ? 7 : Math.max(5, grub * 0.7);
    const h = 92;
    const w = Math.min(84, (h * 100) / v.prop);
    const x0 = 50 - w / 2;
    const gora = 4;
    const dol = 96;
    // tyle obramowań, by w środku zostało co najmniej 22 jednostki (słońce / skrzydła drzwi)
    let n = fav ? 1 : v.n;
    const wewn = (k: number) => w - 2 * (k * grub + (k - 1) * szczel + szczel);
    while (n > 1 && wewn(n) < 22) n--;
    const ramy: Ksztalt[] = [];
    for (let i = 0; i < n; i++) {
      const d = grub / 2 + i * (grub + szczel);
      ramy.push(obrys(liniaLuku(v.typ, x0 + d, x0 + w - d, gora + d, dol), grub, { konce: 'proste', zlacza: 'ostre' }));
    }
    const dIn = n * grub + (n - 1) * szczel + szczel;
    const wIn = w - 2 * dIn;
    const wnetrze: Ksztalt = [zewnetrzny(liniaLuku(v.typ, x0 + dIn, x0 + w - dIn, gora + dIn, dol))];
    let srodek: Ksztalt = [];
    if (v.srodek === 0) srodek = wnetrze;
    else if (v.srodek === 1) {
      // słońce wschodzące w prześwicie bramy (półkole na linii progu)
      const r = wIn * 0.36;
      srodek = przetnij([kolo(50, dol, r)], wnetrze);
    } else if (v.srodek === 2) {
      srodek = odejmij(wnetrze, obrys([[50, 0], [50, 100]], Math.max(szczel, 4), { konce: 'proste' }));
    }
    return wyjscie(
      [
        { k: polacz(...ramy) },
        { k: srodek, kanal: v.akc ? 'akcent' : 'glowny' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

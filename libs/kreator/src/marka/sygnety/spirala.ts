/**
 * „Spirala” – spirala Archimedesa (taśma o stałej grubości z kropką w akcencie), spirala ze złotych ćwiartek
 * albo układ słonecznika (filotaksja – kropki pod złotym kątem). Wzrost, rozwój, twórczość.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, kolo, krzywa, luk, obrys, polacz, scal } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('typ', 'typ: 0 spirala, 1 złote ćwiartki, 2 słonecznik', 0, 2, 0),
  par('zwoje', 'liczba zwojów / kropek (×10 dla słonecznika)', 1, 3, 2),
  par('grub', 'grubość taśmy', 6, 12, 8),
  par('kier', 'kierunek: 0 w prawo, 1 w lewo', 0, 1, 0),
  par('konce', 'zakończenia: 0 proste, 1 okrągłe', 0, 1, 1),
  par('akc', 'kropka/środek w akcencie 0/1', 0, 1, 1),
];

const ZLOTY_KAT = 137.50776;

export const spirala: RodzinaSygnetu = {
  id: 'spirala',
  nazwa: 'Spirala',
  opis: 'Spirala z taśmy, ze złotych ćwiartek albo słonecznik z kropek – wzrost, rozwój, twórczość.',
  charakter: ['naturalna', 'zabawna', 'nowoczesna', 'ekspercka', 'rzemieslnicza'],
  branze: ['edukacja', 'kultura', 'rolnictwo', 'psycholog', 'terap', 'kreatyw', 'pszczel', 'miód', 'matemat'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const kierunek = v.kier ? -1 : 1;
    if (v.typ === 2) {
      const n = fav ? 13 : 10 * v.zwoje + 11;
      const glowny: Ksztalt = [];
      const akcent: Ksztalt = [];
      const rMax = 46;
      const c = rMax / Math.sqrt(n + 0.6);
      for (let i = 1; i <= n; i++) {
        const r = c * Math.sqrt(i);
        const a = ((i * ZLOTY_KAT * kierunek) * Math.PI) / 180;
        const d = c * (0.42 + 0.42 * Math.sqrt(i / n)) * (fav ? 1.1 : 1);
        (i <= 1 && v.akc ? akcent : glowny).push(kolo(50 + r * Math.cos(a), 50 + r * Math.sin(a), d / 1.25));
      }
      return wyjscie([{ k: glowny }, { k: akcent, kanal: 'akcent' }], rozmiarPola(o.wariant));
    }
    const konce = v.konce ? 'okragle' : 'proste';
    if (v.typ === 1) {
      // ćwiartki o promieniach Fibonacciego
      const fib = fav ? [8, 13, 21, 34] : [3, 5, 8, 13, 21, 34].slice(3 - v.zwoje);
      const grub = fav ? Math.max(v.grub, 10) : Math.min(v.grub, fib[0] * 1.2 + 2);
      let cx = 0;
      let cy = 0;
      let kat = 0;
      const cz: Pkt[][] = [];
      for (let i = 0; i < fib.length; i++) {
        const r = fib[i];
        if (i > 0) {
          // nowy środek: przesunięty tak, by łuk zaczynał się w końcu poprzedniego
          const prev = cz[cz.length - 1][cz[cz.length - 1].length - 1];
          cx = prev[0] - r * Math.cos((kat * Math.PI) / 180);
          cy = prev[1] - r * Math.sin((kat * Math.PI) / 180);
        }
        cz.push(luk(cx, cy, r, kat, kat + 90 * kierunek));
        kat += 90 * kierunek;
      }
      const linia = scal(...cz);
      const k = polacz(obrys(linia, grub, { konce }));
      const kropka = v.akc ? [kolo(linia[0][0], linia[0][1], grub * 0.9)] : [];
      return wyjscie([{ k }, { k: kropka, kanal: 'akcent' }], rozmiarPola(o.wariant));
    }
    // Archimedes: r = a + b θ, odstęp między zwojami ≥ grub + 6
    const zwoje = fav ? Math.min(v.zwoje, 1.5) : v.zwoje + 0.25;
    const R = 46;
    const odst = R / (zwoje + 0.35);
    const grub = fav ? Math.min(Math.max(v.grub, 10), odst - 7) : Math.min(v.grub, odst - 6);
    const r0 = v.akc ? grub * 1.6 : grub * 0.7;
    const tMax = zwoje * 2 * Math.PI;
    const linia = krzywa((t) => {
      const th = t * tMax;
      const r = r0 + (odst * th) / (2 * Math.PI);
      return [50 + r * Math.cos(th * kierunek), 50 + r * Math.sin(th * kierunek)];
    }, Math.ceil(zwoje * 90));
    const k = polacz(obrys(linia, grub, { konce }));
    const kropka = v.akc ? [kolo(50, 50, grub * 0.6)] : [];
    return wyjscie([{ k }, { k: kropka, kanal: 'akcent' }], rozmiarPola(o.wariant));
  },
};

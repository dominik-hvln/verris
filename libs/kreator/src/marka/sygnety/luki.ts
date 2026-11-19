/**
 * „Łuki” – koncentryczne łuki (tęcza, wschód, sygnał). Łuki o stałej grubości, zakończenia proste albo okrągłe,
 * opcjonalnie pełne „słońce” w środku; jeden łuk może być w kolorze akcentu.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, kolo, luk, obroc, obrys, polacz, scal } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('n', 'liczba łuków', 2, 5, 3),
  par('grub', 'grubość łuku', 7, 14, 10),
  par('szczel', 'odstęp między łukami', 5, 10, 6),
  par('rozp', 'rozpiętość łuku: 0 półkole, 1 240°, 2 270°', 0, 2, 0),
  par('obrot', 'kierunek: 0 w górę, 1 w prawo, 2 w dół, 3 w lewo', 0, 3, 0),
  par('rdzen', 'pełny środek (słońce) 0/1', 0, 1, 1),
  par('konce', 'zakończenia: 0 proste, 1 okrągłe', 0, 1, 0),
  par('akc', 'łuk w kolorze akcentu (0 – brak, 1 – wewnętrzny…)', 0, 5, 1),
];

export const luki: RodzinaSygnetu = {
  id: 'luki',
  nazwa: 'Łuki',
  opis: 'Koncentryczne łuki o stałej grubości – tęcza, wschód słońca, zasięg. Pogodne i rytmiczne.',
  charakter: ['przyjazna', 'energiczna', 'ciepla', 'nowoczesna', 'zabawna'],
  branze: ['przedszkol', 'eduk', 'energ', 'fotowolt', 'internet', 'radio', 'psycholog', 'dzieci'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const grub = fav ? Math.max(v.grub, 11) : v.grub;
    const szczel = fav ? Math.max(v.szczel, 8) : v.szczel;
    const konce = v.konce ? 'okragle' : 'proste';
    const R = 46;
    const rdzenR = v.rdzen ? Math.max(grub * 1.1, 9) : 0;
    let n = fav ? Math.min(v.n, 3) : v.n;
    // ile łuków się zmieści: od R do rdzenia
    while (n > 1 && R - grub / 2 - (n - 1) * (grub + szczel) - grub / 2 < (v.rdzen ? rdzenR + szczel : grub * 0.8)) n--;
    const rozp = [180, 240, 270][v.rozp];
    const a0 = -90 - rozp / 2;
    const a1 = -90 + rozp / 2;
    const warstwy: { k: Ksztalt; kanal: 'glowny' | 'akcent' }[] = [];
    const akcIdx = v.akc ? Math.min(v.akc, n + (v.rdzen ? 1 : 0)) - 1 : -1;
    // od wewnątrz: 0 = rdzeń (jeśli jest) albo najmniejszy łuk
    let idx = 0;
    if (v.rdzen) {
      // półkole przy łukach 180°, pełne koło przy większych (tarcza w „C”)
      const k: Ksztalt = [rozp === 180 ? scal(luk(50, 50, rdzenR, a0, a1)) : kolo(50, 50, rdzenR)];
      warstwy.push({ k, kanal: idx === akcIdx ? 'akcent' : 'glowny' });
      idx++;
    }
    const rMin = v.rdzen ? rdzenR + szczel + grub / 2 : R - grub / 2 - (n - 1) * (grub + szczel);
    for (let i = 0; i < n; i++) {
      const r = rMin + i * (grub + szczel);
      const k = obrys(luk(50, 50, r, a0, a1), grub, { konce });
      warstwy.push({ k: polacz(k), kanal: idx === akcIdx ? 'akcent' : 'glowny' });
      idx++;
    }
    const obr = warstwy.map((w) => ({ ...w, k: obroc(w.k, v.obrot * 90) }));
    return wyjscie(obr, rozmiarPola(o.wariant));
  },
};

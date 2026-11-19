/**
 * „Ruch” – szewrony (strzałki) o stałej grubości, strzałka z liniami pędu albo strzałka wzrostu (po skosie).
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, obrys, polacz, obroc } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('typ', 'typ: 0 szewrony, 1 strzałka z pędem, 2 strzałka wzrostu', 0, 2, 0),
  par('n', 'liczba szewronów / linii pędu', 1, 4, 3),
  par('grub', 'grubość', 8, 16, 12),
  par('kat', 'rozwarcie grotu (stopnie)', 35, 60, 45),
  par('konce', 'zakończenia: 0 proste, 1 okrągłe', 0, 1, 1),
  par('akc', 'ostatni element w akcencie 0/1', 0, 1, 1),
];

export const strzalka: RodzinaSygnetu = {
  id: 'strzalka',
  nazwa: 'Ruch',
  opis: 'Szewrony albo strzałka z liniami pędu – kierunek, tempo, rozwój. Dynamiczny i prosty.',
  charakter: ['energiczna', 'odwazna', 'nowoczesna', 'techniczna'],
  branze: ['transport', 'logist', 'kurier', 'przeprowadz', 'sport', 'marketing', 'rozw', 'szkolen', 'finans', 'auto'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const grub = fav ? Math.max(v.grub, 13) : v.grub;
    const konce = v.konce ? 'okragle' : 'proste';
    const zlacza = v.konce ? 'okragle' : 'ostre';
    const kat = (v.kat * Math.PI) / 180;
    const ramie = 30;
    const dx = ramie * Math.cos(kat);
    const dy = ramie * Math.sin(kat);
    const warstwy: { k: Ksztalt; kanal?: 'glowny' | 'akcent' }[] = [];
    if (v.typ === 0) {
      const n = fav ? Math.min(v.n, 2) : v.n;
      const odst = grub * 1.75;
      const wsz: Ksztalt[] = [];
      for (let i = 0; i < n; i++) {
        const x = i * odst;
        const k = polacz(obrys([[x - dx, 50 - dy], [x, 50], [x - dx, 50 + dy]], grub, { konce, zlacza }));
        wsz.push(k);
      }
      wsz.forEach((k, i) => warstwy.push({ k, kanal: v.akc && i === wsz.length - 1 && n > 1 ? 'akcent' : 'glowny' }));
      return wyjscie(warstwy, rozmiarPola(o.wariant));
    }
    // strzałka: grot + trzon + linie pędu
    const grot = polacz(obrys([[70 - dx, 50 - dy], [70, 50], [70 - dx, 50 + dy]], grub, { konce, zlacza }));
    const trzon = obrys([[16, 50], [66, 50]], grub, { konce });
    const strz = polacz(grot, trzon);
    const pedy: Ksztalt[] = [];
    const n = fav ? 0 : Math.min(v.n, 3);
    if (v.typ === 1) {
      for (let i = 0; i < n; i++) {
        const y = 50 + (i % 2 ? 1 : -1) * (grub * 1.7) * Math.ceil((i + 1) / 2);
        const x1 = 44 - i * 4;
        const x0 = x1 - 28 + i * 6;
        if (Math.abs(y - 50) > dy + grub * 0.2) continue;
        pedy.push(obrys([[x0, y], [x1, y]], grub * 0.62, { konce }));
      }
      warstwy.push({ k: strz }, { k: polacz(...pedy), kanal: v.akc ? 'akcent' : 'glowny' });
      return wyjscie(warstwy, rozmiarPola(o.wariant));
    }
    // wzrost: strzałka po skosie + słupki
    const skos = obroc(strz, -45, 50, 50);
    const slupki: Ksztalt[] = [];
    if (!fav)
      for (let i = 0; i < n; i++) {
        const x = 18 + i * (grub * 1.6);
        const h = 14 + i * 10;
        slupki.push(obrys([[x, 96], [x, 96 - h]], grub * 0.85, { konce: 'proste' }));
      }
    warstwy.push({ k: skos, kanal: v.akc ? 'akcent' : 'glowny' }, { k: polacz(...slupki) });
    return wyjscie(warstwy, rozmiarPola(o.wariant));
  },
};

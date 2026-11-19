/**
 * „Węzeł” – pętla nieskończoności, trójlistny węzeł albo węzeł pięcioramienny jako taśma o stałej grubości
 * z prawdziwym przeplotem (nad/pod na przemian, szczelina wokół górnej taśmy). Ciągłość, relacja, splot.
 */
import type { RodzinaSygnetu } from '../typy.ts';
import { type Ksztalt, type Pkt, krzywa, obrys, odejmij, polacz, przetnij, kolo } from '../geometria.ts';
import { odczytaj, par, rozmiarPola, wyjscie } from './wspolne.ts';

const PARAMETRY = [
  par('typ', 'krzywa: 0 nieskończoność, 1 trójliść, 2 pięcioramienny', 0, 2, 1),
  par('grub', 'grubość taśmy', 6, 11, 8),
  par('szczel', 'szczelina przeplotu', 3, 6, 4),
  par('prop', 'proporcja (%)', 80, 120, 100),
  par('akc', 'połowa taśmy w akcencie 0/1', 0, 1, 0),
];

function punktKrzywej(typ: number, t: number, prop: number): Pkt {
  const T = 2 * Math.PI * t;
  if (typ === 0) {
    const s = Math.sin(T);
    const c = Math.cos(T);
    const d = 1 + s * s;
    return [50 + (46 * c) / d, 50 + ((46 * s * c) / d) * prop * 1.7];
  }
  if (typ === 1) {
    // klasyczny trójliść: x = sin t + 2 sin 2t, y = cos t − 2 cos 2t (symetria trzykrotna)
    return [50 + 15 * (Math.sin(T) + 2 * Math.sin(2 * T)), 50 - 15 * prop * (Math.cos(T) - 2 * Math.cos(2 * T)) - 5];
  }
  const q = 5;
  const u = 2 * T; // dwa obiegi (węzeł torusowy (2, 5))
  const r = 2 + Math.cos((q * u) / 2);
  return [50 + (r * Math.cos(u) * 46) / 3, 50 + (r * Math.sin(u) * 46 * prop) / 3];
}

interface Krzyzowanie {
  p: Pkt;
  t: [number, number];
}

function krzyzowania(pkt: Pkt[]): Krzyzowanie[] {
  const n = pkt.length - 1;
  const wyn: Krzyzowanie[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = pkt[i];
      const b = pkt[i + 1];
      const c = pkt[j];
      const d = pkt[j + 1];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1)
        wyn.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [(i + t) / n, (j + u) / n] });
    }
  return wyn;
}

export const petla: RodzinaSygnetu = {
  id: 'petla',
  nazwa: 'Węzeł',
  opis: 'Taśma w kształcie nieskończoności albo węzła z przeplotem nad/pod – ciągłość, relacje, rzemiosło.',
  charakter: ['elegancka', 'klasyczna', 'rzemieslnicza', 'spokojna', 'ekspercka'],
  branze: ['doradztwo', 'rzemioslo', 'logistyka', 'terap', 'coach', 'rękodzieł', 'krawiec', 'ubezpiecz'],
  monogram: false,
  kanaly: 2,
  parametry: PARAMETRY,
  rysuj(p, o) {
    const v = odczytaj(PARAMETRY, p);
    const fav = o.wariant === 'favicon';
    const typ = fav && v.typ === 2 ? 1 : v.typ;
    const grub = fav ? Math.max(v.grub, 10) : typ === 2 ? Math.min(v.grub, 8) : v.grub;
    const szczel = fav ? Math.max(v.szczel, 5) : v.szczel;
    const prop = v.prop / 100;
    const N = typ === 0 ? 200 : 360;
    const pkt = krzywa((t) => punktKrzywej(typ, t, prop), N);
    const kr = krzyzowania(pkt);
    // kolejność spotkań wzdłuż krzywej: na przemian nad / pod
    const spotkania = kr.flatMap((k, i) => [
      { t: k.t[0], i },
      { t: k.t[1], i },
    ]);
    spotkania.sort((a, b) => a.t - b.t);
    const gorne = new Map<number, number>();
    spotkania.forEach((s, j) => {
      if (j % 2 === 0 && !gorne.has(s.i)) gorne.set(s.i, s.t);
    });
    for (const s of spotkania) if (!gorne.has(s.i)) gorne.set(s.i, s.t);
    const odcinek = (t0: number, t1: number): Pkt[] =>
      krzywa((t) => punktKrzywej(typ, ((t0 + (t1 - t0) * t) % 1 + 1) % 1, prop), 40);
    let tasma = polacz(obrys(pkt, grub, { zamknieta: true }));
    const nad: Ksztalt[] = [];
    for (const [i, t] of gorne) {
      const k = kr[i];
      const a = punktKrzywej(typ, t, prop);
      const b = punktKrzywej(typ, (t + 1e-4) % 1, prop);
      const dl = (grub * 1.6 + szczel * 2) / (Math.hypot(b[0] - a[0], b[1] - a[1]) / 1e-4);
      const lok = odcinek(t - dl, t + dl);
      const okolica: Ksztalt = [kolo(k.p[0], k.p[1], grub + szczel * 1.5)];
      tasma = odejmij(tasma, przetnij(polacz(obrys(lok, grub + 2 * szczel, { konce: 'proste' })), okolica));
      nad.push(przetnij(polacz(obrys(lok, grub, { konce: 'proste' })), okolica));
    }
    const calosc = polacz(tasma, ...nad);
    if (!v.akc || fav) return wyjscie([{ k: calosc }], rozmiarPola(o.wariant));
    const pol: Ksztalt = [[[50, -20], [140, -20], [140, 120], [50, 120]]];
    return wyjscie(
      [
        { k: odejmij(calosc, pol) },
        { k: przetnij(calosc, pol), kanal: 'akcent' },
      ],
      rozmiarPola(o.wariant),
    );
  },
};

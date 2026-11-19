/** Kształty pojemników dla rodzin monogramowych (koło, kafel, sześciokąt, tarcza, łuk) – kontury w polu 4–96. */
import { type Kontur, type Pkt, kolo, luk, prostokat, scal, wielokatForemny, zaokraglij, zewnetrzny } from '../geometria.ts';

export const KSZTALTY_POJEMNIKA = ['koło', 'kafel', 'sześciokąt', 'tarcza', 'łuk'] as const;

export function pojemnik(typ: number, wsun = 0): Kontur {
  const d = wsun;
  switch (typ) {
    case 1:
      return prostokat(5 + d, 5 + d, 90 - 2 * d, 90 - 2 * d, Math.max(2, 22 - d));
    case 2:
      return zewnetrzny(zaokraglij(wielokatForemny(50, 50, 48 - d * 1.15, 6, -90), Math.max(1, 6 - d * 0.5)));
    case 3: {
      // tarcza: prosta góra, boki łagodnie zbiegające do ostrza
      const t: Pkt[] = scal(
        [[8 + d, 6 + d], [92 - d, 6 + d], [92 - d, 46]],
        [
          ...Array.from({ length: 30 }, (_, i): Pkt => {
            const t = (i + 1) / 30;
            const u = 1 - t;
            // krzywa z (92-d,46) do (50, 96-d*1.4)
            const p0: Pkt = [92 - d, 46];
            const p1: Pkt = [92 - d, 74];
            const p2: Pkt = [68, 88 - d];
            const p3: Pkt = [50, 96 - d * 1.4];
            return [
              u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
              u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
            ];
          }),
        ],
      );
      const lustro = t
        .slice(0, -1)
        .reverse()
        .map(([x, y]): Pkt => [100 - x, y]);
      return zewnetrzny(zaokraglij(scal(t, lustro.slice(0, -1)), 0));
    }
    case 4:
      return zewnetrzny(scal(luk(50, 46, 42 - d, 180, 360), [[92 - d, 96 - d], [8 + d, 96 - d]]));
    default:
      return kolo(50, 50, 46 - d);
  }
}

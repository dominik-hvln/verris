/**
 * Litery monogramów rysowane własną geometrią (NIE z fontu): szkielety A–Z, 0–9 i polskie Ą Ć Ę Ł Ń Ó Ś Ź Ż
 * (baza + znak diakrytyczny), obrysowane linią o stałej grubości. Styl: geometryczny monolinearny (koło, prosta,
 * łuk), dwa zakończenia – okrągłe (miękki, przyjazny) i proste (cięte w poziomie na linii wersalików i bazowej).
 *
 * Jednostki: wysokość wersalików = 100, y w dół (0 = linia wersalików, 100 = linia bazowa), x od 0.
 * Zasada konstrukcji: tam, gdzie kreski tworzą narożnik, są jedną linią (złącze liczy obrys); kreska kończąca się
 * na innej kresce kończy się WEWNĄTRZ niej (połączenie T) – inaczej w stylu prostym zostałby ząbek w narożniku.
 */
import {
  type Ksztalt,
  type Pkt,
  bezier2,
  luk,
  obrys,
  odejmij,
  polacz,
  prostokat,
  przesun,
  przetnij,
  granice,
} from '../geometria.ts';

export interface LiniaSzkieletu {
  pts: Pkt[];
  zamknieta?: boolean;
}

export interface Szkielet {
  szer: number;
  linie: LiniaSzkieletu[];
  /** Litera ma pionowy trzon po lewej (x = 0, 0–100) – rodzina „kolumna + litera” zastępuje go kolumną. */
  trzon?: boolean;
}

const L = (...pts: (Pkt | Pkt[])[]): LiniaSzkieletu => ({
  pts: pts.flatMap((p) => (typeof p[0] === 'number' ? [p as Pkt] : (p as Pkt[]))),
});
const Z = (...pts: (Pkt | Pkt[])[]): LiniaSzkieletu => ({ ...L(...pts), zamknieta: true });
const kolko = (cx: number, cy: number, rx: number, ry = rx): LiniaSzkieletu => {
  const p = luk(cx, cy, rx, -90, 270, ry);
  p.pop();
  return { pts: p, zamknieta: true };
};

const SZKIELETY: Record<string, Szkielet> = {
  A: { szer: 86, linie: [L([0, 100], [43, 0], [86, 100]), L([15.5, 64], [70.5, 64])] },
  B: {
    szer: 68,
    trzon: true,
    linie: [L([0, 48], [42, 48], luk(42, 74, 26, -90, 90), [0, 100], [0, 0], [38, 0], luk(38, 24, 24, -90, 90), [0, 48])],
  },
  C: { szer: 92, linie: [L(luk(50, 50, 50, -42, -318))] },
  D: { szer: 80, trzon: true, linie: [Z([0, 0], [30, 0], luk(30, 50, 50, -90, 90), [0, 100])] },
  E: { szer: 66, trzon: true, linie: [L([66, 0], [0, 0], [0, 100], [66, 100]), L([0, 50], [56, 50])] },
  F: { szer: 64, trzon: true, linie: [L([64, 0], [0, 0], [0, 100]), L([0, 50], [54, 50])] },
  G: { szer: 100, linie: [L(luk(50, 50, 50, -45, -360), [56, 50])] },
  H: { szer: 74, trzon: true, linie: [L([0, 0], [0, 100]), L([74, 0], [74, 100]), L([0, 50], [74, 50])] },
  I: { szer: 0, trzon: true, linie: [L([0, 0], [0, 100])] },
  J: { szer: 60, linie: [L([60, 0], [60, 70], luk(30, 70, 30, 0, 180))] },
  K: { szer: 72, trzon: true, linie: [L([0, 0], [0, 100]), L([70, 0], [0, 64]), L([24, 42], [74, 100])] },
  L: { szer: 62, trzon: true, linie: [L([0, 0], [0, 100], [62, 100])] },
  M: { szer: 92, trzon: true, linie: [L([0, 100], [0, 0], [46, 76], [92, 0], [92, 100])] },
  N: { szer: 76, trzon: true, linie: [L([0, 100], [0, 0], [76, 100], [76, 0])] },
  O: { szer: 100, linie: [kolko(50, 50, 50)] },
  P: { szer: 64, trzon: true, linie: [L([0, 100], [0, 0], [36, 0], luk(36, 27, 27, -90, 90), [0, 54])] },
  Q: { szer: 100, linie: [kolko(50, 50, 50), L([60, 62], [98, 102])] },
  R: {
    szer: 70,
    trzon: true,
    linie: [L([0, 100], [0, 0], [36, 0], luk(36, 27, 27, -90, 90), [0, 54]), L([34, 54], [72, 100])],
  },
  S: { szer: 68, linie: [L(luk(42, 26, 26, -18, -270), luk(42, 76, 24, -90, 158))] },
  T: { szer: 80, linie: [L([0, 0], [80, 0]), L([40, 0], [40, 100])] },
  U: { szer: 76, linie: [L([0, 0], [0, 62], luk(38, 62, 38, 180, 0), [76, 0])] },
  V: { szer: 84, linie: [L([0, 0], [42, 100], [84, 0])] },
  W: { szer: 104, linie: [L([0, 0], [25, 100], [52, 0], [79, 100], [104, 0])] },
  X: { szer: 78, linie: [L([0, 0], [78, 100]), L([78, 0], [0, 100])] },
  Y: { szer: 80, linie: [L([0, 0], [40, 52], [80, 0]), L([40, 52], [40, 100])] },
  Z: { szer: 72, linie: [L([2, 0], [72, 0], [0, 100], [72, 100])] },
  '0': { szer: 72, linie: [kolko(36, 50, 36, 50)] },
  '1': { szer: 40, linie: [L([6, 18], [40, 0], [40, 100])] },
  '2': { szer: 70, linie: [L(luk(35, 30, 30, -165, 32), [0, 100], [70, 100])] },
  '3': { szer: 64, linie: [L(luk(34, 26, 26, -160, 90)), L(luk(34, 76, 24, -90, 162))] },
  '4': { szer: 76, linie: [L([56, 100], [56, 0], [0, 70], [76, 70])] },
  '5': { szer: 68, linie: [L([66, 0], [10, 0], [7, 46]), L(luk(36, 68, 32, -142, 142))] },
  '6': { szer: 70, linie: [kolko(35, 66, 34), L([62, 2], [9, 50])] },
  '7': { szer: 72, linie: [L([0, 0], [72, 0], [22, 100])] },
  '8': { szer: 64, linie: [kolko(32, 24, 24), kolko(32, 73, 27)] },
  '9': { szer: 70, linie: [kolko(35, 34, 34), L([61, 50], [8, 98])] },
};

type Diakrytyk = 'kreska' | 'kropka' | 'ogonek' | 'ukosnik';
const POLSKIE: Record<string, [string, Diakrytyk]> = {
  Ą: ['A', 'ogonek'],
  Ć: ['C', 'kreska'],
  Ę: ['E', 'ogonek'],
  Ł: ['L', 'ukosnik'],
  Ń: ['N', 'kreska'],
  Ó: ['O', 'kreska'],
  Ś: ['S', 'kreska'],
  Ź: ['Z', 'kreska'],
  Ż: ['Z', 'kropka'],
};

/** Litery obsługiwane przez monogramy (do walidacji i opisu dla AI). */
export const LITERY_MONOGRAMU = [...Object.keys(SZKIELETY), ...Object.keys(POLSKIE)];

/**
 * Normalizuje litery monogramu: wersaliki, tylko obsługiwane znaki (inne – do bazy bez akcentów, np. Ü → U),
 * najwyżej `ile` znaków. Pusty wynik → ['V'] nie, tylko pierwsza litera nazwy decyduje – wywołujący podaje fallback.
 */
export function normalizujLitery(tekst: string | undefined, ile = 2): string[] {
  const wyn: string[] = [];
  for (const z of (tekst ?? '').toLocaleUpperCase('pl-PL')) {
    let c = z;
    if (!SZKIELETY[c] && !POLSKIE[c]) c = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (SZKIELETY[c] || POLSKIE[c]) wyn.push(c);
    if (wyn.length >= ile) break;
  }
  return wyn;
}

/** Inicjały z nazwy firmy (pierwsze litery słów, najwyżej 2). */
export function inicjaly(nazwa: string, ile = 2): string {
  const slowa = nazwa.split(/[\s\-–&+]+/).filter(Boolean);
  const lit = slowa.map((s) => normalizujLitery(s, 1)[0]).filter(Boolean);
  if (lit.length === 0) return 'V';
  return lit.slice(0, ile).join('');
}

export function szkielet(znak: string): Szkielet {
  const baza = POLSKIE[znak]?.[0] ?? znak;
  return SZKIELETY[baza] ?? SZKIELETY.O;
}

export interface OpcjeLitery {
  konce?: 'okragle' | 'proste';
  /** Dodatkowe poszerzenie (po obu stronach) – do wycięć przeplotu; geometria szkieletu ta sama. */
  poszerz?: number;
  /** Pomiń trzon (dla „kolumna + litera”): wycina pas x < grub/2 + szczelina. */
  bezTrzonu?: number;
}

/**
 * Kształt litery w jednostkach wersalików (100), z diakrytykiem. Grubość kreski `grub` (np. 12–26).
 * Styl prosty: kreski obcięte poziomo na y = −grub/2 i 100 + grub/2 (szpice narożników nie wystają).
 */
export function ksztaltLitery(znak: string, grub: number, o: OpcjeLitery = {}): Ksztalt {
  const sz = szkielet(znak);
  const konce = o.konce ?? 'okragle';
  const w = grub + 2 * (o.poszerz ?? 0);
  const h = grub / 2;
  let k: Ksztalt = polacz(
    ...sz.linie.map((l) => obrys(l.pts, w, { konce, zamknieta: l.zamknieta, zlacza: konce === 'okragle' ? 'okragle' : 'ostre' })),
  );
  if (konce === 'proste') {
    const pole = prostokat(-200, -h - (o.poszerz ?? 0), 600, 100 + grub + 2 * (o.poszerz ?? 0));
    k = przetnij(k, [pole]);
  }
  if (o.bezTrzonu !== undefined && sz.trzon) {
    k = odejmij(k, [prostokat(-200, -200, 200 + h + o.bezTrzonu, 600)]);
  }
  const dia = POLSKIE[znak]?.[1];
  if (dia) k = polacz(k, diakrytyk(dia, sz, grub, w, konce));
  return k;
}

function diakrytyk(d: Diakrytyk, sz: Szkielet, grub: number, w: number, konce: 'okragle' | 'proste'): Ksztalt {
  const cx = sz.szer / 2;
  const nad = -grub / 2 - Math.max(9, grub * 0.7);
  switch (d) {
    case 'kreska':
      return obrys(
        [
          [cx - 6, nad],
          [cx + 12, nad - 22],
        ],
        w * 0.9,
        { konce },
      );
    case 'kropka': {
      const r = grub * 0.62 + (w - grub) / 2;
      return obrys([[cx, nad - r + 2]], r * 2);
    }
    case 'ogonek': {
      const x0 = sz.szer - (sz.szer > 80 ? 8 : 14);
      return obrys(bezier2([x0, 100 + grub * 0.3], [x0 - 18, 120], [x0 + 6, 130]), w * 0.8, { konce: 'okragle' });
    }
    case 'ukosnik':
      return obrys(
        [
          [-14, 66],
          [26, 38],
        ],
        w * 0.85,
        { konce },
      );
  }
}

/** Kilka liter obok siebie (jednostki wersalików), odstęp optyczny zależny od grubości. */
export function ulozLitery(znaki: string[], grub: number, o: OpcjeLitery & { odstep?: number } = {}): Ksztalt {
  let x = 0;
  const wyn: Ksztalt = [];
  for (const z of znaki) {
    const k = ksztaltLitery(z, grub, o);
    const g = granice(k);
    wyn.push(...przesun(k, x - g.x0, 0));
    x += g.x1 - g.x0 + (o.odstep ?? grub * 0.9);
  }
  return wyn;
}

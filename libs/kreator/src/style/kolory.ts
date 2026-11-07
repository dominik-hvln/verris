import type { Paleta } from '../model.ts';
import type { CharakterPalety } from './katalog-stylow.ts';

/**
 * Kolory kreatora: OKLCH → sRGB (własna implementacja, bez bibliotek), kontrast WCAG 2.x i generator
 * palety semantycznej z barwy akcentu i charakteru. Każda paleta wychodząca z `generujPalete`
 * i `korygujPalete` spełnia WCAG AA (≥ 4,5:1) dla par z PARY_KONTRASTU – pilnuje test właściwości
 * 360 barw × 5 charakterów.
 *
 * Źródła: OKLab – Björn Ottosson, https://bottosson.github.io/posts/oklab/ (macierze poniżej);
 * luminancja i współczynnik kontrastu – WCAG 2.2, https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 * i https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio.
 */

export const MIN_KONTRAST_AA = 4.5;

type Rgb = [number, number, number];
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const zakres = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));

function oklabDoLiniowego(l: number, a: number, b: number): Rgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function liniowyDoOklab([r, g, b]: Rgb): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const doGammy = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const zGammy = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

function liniowyZOklch({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  return oklabDoLiniowego(l, c * Math.cos(rad), c * Math.sin(rad));
}

const wGamucie = (rgb: Rgb) => rgb.every((x) => x >= -1e-6 && x <= 1 + 1e-6);

/** OKLCH → hex sRGB. Kolor spoza gamutu traci nasycenie (wyszukiwanie binarne po C przy stałych L i h). */
export function oklchDoHex(kolor: Oklch): string {
  const l = zakres(kolor.l);
  let rgb = liniowyZOklch({ l, c: kolor.c, h: kolor.h });
  if (!wGamucie(rgb)) {
    let lo = 0;
    let hi = kolor.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (wGamucie(liniowyZOklch({ l, c: mid, h: kolor.h }))) lo = mid;
      else hi = mid;
    }
    rgb = liniowyZOklch({ l, c: lo, h: kolor.h });
  }
  return '#' + rgb.map((x) => Math.round(zakres(doGammy(zakres(x))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexDoRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255) as Rgb;
}

export function hexDoOklch(hex: string): Oklch {
  const [L, a, b] = liniowyDoOklab(hexDoRgb(hex).map(zGammy) as Rgb);
  const c = Math.hypot(a, b);
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Luminancja względna WCAG 2.x. */
export function luminancja(hex: string): number {
  const [r, g, b] = hexDoRgb(hex).map(zGammy);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Współczynnik kontrastu WCAG (1–21). */
export function kontrast(a: string, b: string): number {
  const la = luminancja(a);
  const lb = luminancja(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type KluczPalety = keyof Paleta;

/** Pary, które muszą mieć kontrast AA: kolor tekstu → tła, na których stoi. */
export const PARY_KONTRASTU: { tekst: KluczPalety; tla: KluczPalety[] }[] = [
  { tekst: 'tekst', tla: ['tlo', 'powierzchnia'] },
  { tekst: 'tekstPrzygaszony', tla: ['tlo', 'powierzchnia'] },
  { tekst: 'akcentTekst', tla: ['tlo', 'powierzchnia'] },
  { tekst: 'naAkcencie', tla: ['akcent'] },
  { tekst: 'naCiemnym', tla: ['ciemne'] },
];

const minKontrast = (fg: string, tla: string[]) => Math.min(...tla.map((t) => kontrast(fg, t)));

/**
 * Zmienia jasność koloru tekstu (zachowując barwę i – w granicach gamutu – nasycenie), aż osiągnie
 * `min` wobec wszystkich teł. Kierunek: ku bieli albo czerni – tam, gdzie da się uzyskać większy kontrast.
 * Ostatecznie czysta biel albo czerń (dla dowolnego tła jedna z nich daje ≥ 4,58:1).
 */
export function dopasujKontrast(fg: string, tla: string[], min = MIN_KONTRAST_AA): string {
  if (minKontrast(fg, tla) >= min) return fg;
  const doBieli = minKontrast('#FFFFFF', tla) >= minKontrast('#000000', tla);
  const start = hexDoOklch(fg);
  for (let krok = 1; krok <= 100; krok++) {
    const l = doBieli ? start.l + krok * 0.01 : start.l - krok * 0.01;
    if (l < 0 || l > 1) break;
    const kandydat = oklchDoHex({ l, c: start.c, h: start.h });
    if (minKontrast(kandydat, tla) >= min) return kandydat;
  }
  return doBieli ? '#FFFFFF' : '#000000';
}

export interface KorektaPalety {
  paleta: Paleta;
  /** Klucze kolorów zmienionych dla kontrastu. */
  zmienione: KluczPalety[];
}

/** Doprowadza paletę (np. od AI albo z edytora) do WCAG AA, zmieniając wyłącznie kolory tekstu. */
export function korygujPalete(wejscie: Paleta): KorektaPalety {
  const paleta: Paleta = { ...wejscie };
  for (const k of Object.keys(paleta) as KluczPalety[]) paleta[k] = paleta[k].toUpperCase();
  const zmienione: KluczPalety[] = [];
  for (const { tekst, tla } of PARY_KONTRASTU) {
    const nowy = dopasujKontrast(paleta[tekst], tla.map((t) => paleta[t]));
    if (nowy !== paleta[tekst]) {
      paleta[tekst] = nowy;
      zmienione.push(tekst);
    }
  }
  return { paleta, zmienione };
}

/** Sprawdza pary AA; zwraca opisy niespełnionych (pusta lista = paleta w porządku). */
export function sprawdzKontrastPalety(p: Paleta, min = MIN_KONTRAST_AA): string[] {
  const bledy: string[] = [];
  for (const { tekst, tla } of PARY_KONTRASTU) {
    for (const t of tla) {
      const k = kontrast(p[tekst], p[t]);
      if (k < min) bledy.push(`${tekst}/${t}: kontrast ${k.toFixed(2)} < ${min}`);
    }
  }
  return bledy;
}

type Przepis = Record<KluczPalety, Oklch>;

const norm = (h: number) => ((h % 360) + 360) % 360;

/** Przepisy palet: jasność i nasycenie ról w OKLCH; barwa neutralnych podąża za akcentem (ciepło/chłód). */
function przepis(barwa: number, charakter: CharakterPalety): Przepis {
  const h = norm(barwa);
  switch (charakter) {
    case 'jasna':
      return {
        tlo: { l: 0.975, c: 0.01, h }, powierzchnia: { l: 0.94, c: 0.018, h }, tekst: { l: 0.23, c: 0.02, h },
        tekstPrzygaszony: { l: 0.45, c: 0.025, h }, akcent: { l: 0.5, c: 0.13, h }, naAkcencie: { l: 0.985, c: 0.008, h },
        akcentTekst: { l: 0.47, c: 0.13, h }, linia: { l: 0.87, c: 0.02, h }, ciemne: { l: 0.25, c: 0.05, h }, naCiemnym: { l: 0.965, c: 0.01, h },
      };
    case 'ciemna':
      return {
        tlo: { l: 0.17, c: 0.015, h }, powierzchnia: { l: 0.22, c: 0.02, h }, tekst: { l: 0.95, c: 0.01, h },
        tekstPrzygaszony: { l: 0.77, c: 0.02, h }, akcent: { l: 0.78, c: 0.12, h }, naAkcencie: { l: 0.18, c: 0.02, h },
        akcentTekst: { l: 0.8, c: 0.12, h }, linia: { l: 0.32, c: 0.02, h }, ciemne: { l: 0.12, c: 0.012, h }, naCiemnym: { l: 0.95, c: 0.01, h },
      };
    case 'kontrastowa':
      return {
        tlo: { l: 0.995, c: 0, h }, powierzchnia: { l: 0.955, c: 0.006, h }, tekst: { l: 0.14, c: 0.01, h },
        tekstPrzygaszony: { l: 0.38, c: 0.012, h }, akcent: { l: 0.6, c: 0.2, h }, naAkcencie: { l: 0.995, c: 0, h },
        akcentTekst: { l: 0.5, c: 0.18, h }, linia: { l: 0.2, c: 0.01, h }, ciemne: { l: 0.14, c: 0.01, h }, naCiemnym: { l: 0.995, c: 0, h },
      };
    case 'pastelowa':
      return {
        tlo: { l: 0.978, c: 0.015, h }, powierzchnia: { l: 0.93, c: 0.045, h }, tekst: { l: 0.27, c: 0.04, h },
        tekstPrzygaszony: { l: 0.44, c: 0.04, h }, akcent: { l: 0.62, c: 0.12, h }, naAkcencie: { l: 0.2, c: 0.03, h },
        akcentTekst: { l: 0.46, c: 0.12, h }, linia: { l: 0.88, c: 0.04, h }, ciemne: { l: 0.3, c: 0.06, h }, naCiemnym: { l: 0.97, c: 0.015, h },
      };
    case 'ziemista': {
      // Neutralne w ciepłym kierunku papieru (h ≈ 70), akcent w barwie wybranej, przygaszony.
      const n = 70;
      return {
        tlo: { l: 0.955, c: 0.02, h: n }, powierzchnia: { l: 0.915, c: 0.028, h: n }, tekst: { l: 0.25, c: 0.02, h: n },
        tekstPrzygaszony: { l: 0.44, c: 0.03, h: n }, akcent: { l: 0.47, c: 0.1, h }, naAkcencie: { l: 0.96, c: 0.015, h: n },
        akcentTekst: { l: 0.44, c: 0.1, h }, linia: { l: 0.84, c: 0.03, h: n }, ciemne: { l: 0.27, c: 0.04, h }, naCiemnym: { l: 0.955, c: 0.02, h: n },
      };
    }
  }
}

/** Paleta semantyczna z barwy akcentu (0–359) i charakteru, zawsze z kontrastem AA. Deterministyczna. */
export function generujPalete(barwa: number, charakter: CharakterPalety): Paleta {
  const p = przepis(barwa, charakter);
  const surowa = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, oklchDoHex(v)])) as Paleta;
  return korygujPalete(surowa).paleta;
}

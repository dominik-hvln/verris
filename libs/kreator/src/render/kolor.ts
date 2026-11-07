/**
 * Kolory: kontrast WCAG 2.x i korekta jasności w OKLCH (zachowuje odcień i nasycenie na tyle,
 * na ile pozwala gamut sRGB). Bez zależności – działa w API, panelu i testach.
 */
export type Rgb = [number, number, number];

export function hexNaRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const pelny = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(pelny, 16);
  if (!/^[0-9a-f]{6}$/i.test(pelny) || Number.isNaN(n)) throw new Error(`Niepoprawny kolor: ${hex}`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbNaHex([r, g, b]: Rgb): string {
  const k = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${k(r)}${k(g)}${k(b)}`.toUpperCase();
}

const doLiniowego = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const zLiniowego = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Luminancja względna wg WCAG 2.x. */
export function luminancja(hex: string): number {
  const [r, g, b] = hexNaRgb(hex).map(doLiniowego) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Współczynnik kontrastu WCAG (1–21). */
export function kontrastWcag(a: string, b: string): number {
  const la = luminancja(a);
  const lb = luminancja(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function czyCiemny(hex: string): boolean {
  // Próg, przy którym biały i czarny tekst mają równy kontrast (≈ 0,179).
  return luminancja(hex) < 0.179;
}

/** Mieszanie w sRGB: t = 0 → a, t = 1 → b. */
export function mieszaj(a: string, b: string, t: number): string {
  const x = hexNaRgb(a);
  const y = hexNaRgb(b);
  return rgbNaHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function rgba(hex: string, alfa: number): string {
  const [r, g, b] = hexNaRgb(hex);
  return `rgba(${r},${g},${b},${alfa})`;
}

// --- OKLCH (Björn Ottosson, https://bottosson.github.io/posts/oklab/) ---
type Lch = { l: number; c: number; h: number };

function hexNaOklch(hex: string): Lch {
  const [r, g, b] = hexNaRgb(hex).map(doLiniowego) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function oklchNaRgbLin({ l: L, c, h }: Lch): Rgb {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → hex; poza gamutem zmniejsza nasycenie (c), aż kolor się zmieści. */
function oklchNaHex(lch: Lch): string {
  let c = lch.c;
  for (let i = 0; i < 30; i++) {
    const lin = oklchNaRgbLin({ ...lch, c });
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbNaHex(lin.map((v) => zLiniowego(Math.min(1, Math.max(0, v)))) as Rgb);
    c *= 0.85;
  }
  return rgbNaHex(oklchNaRgbLin({ ...lch, c: 0 }).map((v) => zLiniowego(Math.min(1, Math.max(0, v)))) as Rgb);
}

/**
 * Najmniejsza zmiana jasności (OKLCH L) koloru `kolor`, przy której kontrast z KAŻDYM z `tla`
 * osiąga `min`. Najpierw w stronę dalszą od teł (ciemniej na jasnym tle), potem w przeciwną.
 * Gdy się nie da (tła o skrajnie różnej jasności) – zwraca czarny albo biały, lepszy z dwóch.
 */
export function dopasujKontrast(kolor: string, tla: string[], min: number): string {
  const najgorszy = (k: string) => Math.min(...tla.map((t) => kontrastWcag(k, t)));
  if (najgorszy(kolor) >= min) return kolor.toUpperCase();
  const lch = hexNaOklch(kolor);
  const srednieL = tla.reduce((s, t) => s + luminancja(t), 0) / tla.length;
  const kierunki = srednieL > 0.179 ? [-1, 1] : [1, -1];
  for (const kier of kierunki) {
    for (let krok = 1; krok <= 100; krok++) {
      const l = lch.l + kier * krok * 0.01;
      if (l < 0 || l > 1) break;
      const kandydat = oklchNaHex({ ...lch, l });
      if (najgorszy(kandydat) >= min) return kandydat;
    }
  }
  return najgorszy('#000000') >= najgorszy('#FFFFFF') ? '#000000' : '#FFFFFF';
}

export function formatKontrastu(k: number): string {
  return `${(Math.floor(k * 100) / 100).toFixed(2).replace('.', ',')}:1`;
}

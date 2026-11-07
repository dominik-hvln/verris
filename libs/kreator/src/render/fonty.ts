import type { Motyw } from '../model.ts';
import { KATALOG_FONTOW, type FontKatalogu } from '../style/katalog-stylow.ts';

/**
 * Wiedza renderera o krojach z katalogu (Google Fonts, pliki kopiowane na hosting klienta).
 * `naglowek` – waga nagłówków, w której krój wygląda najlepiej; `kursywa` – czy jest odmiana italic.
 * Krój spoza listy traktujemy jako bezszeryfowy, nagłówki 600, tekst 400/600.
 */
interface OpisKroju {
  kategoria: 'szeryf' | 'bezszeryf' | 'mono' | 'odreczny';
  naglowek: number;
  /** Dostępne wagi; brak = pełny zakres 400–700. */
  wagi?: number[];
  kursywa: boolean;
}

const KROJE: Record<string, OpisKroju> = {
  Fraunces: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'DM Serif Display': { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: true },
  'DM Serif Text': { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: true },
  'Instrument Serif': { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: true },
  'Playfair Display': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Cormorant Garamond': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  Cormorant: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  Lora: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Libre Baskerville': { kategoria: 'szeryf', naglowek: 400, wagi: [400, 700], kursywa: true },
  Newsreader: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'EB Garamond': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Young Serif': { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: false },
  Gloock: { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: false },
  'Bodoni Moda': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  Literata: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Source Serif 4': { kategoria: 'szeryf', naglowek: 600, kursywa: true },
  Merriweather: { kategoria: 'szeryf', naglowek: 700, wagi: [400, 700], kursywa: true },
  Spectral: { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Crimson Pro': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  'Noto Serif': { kategoria: 'szeryf', naglowek: 600, kursywa: true },
  'IBM Plex Serif': { kategoria: 'szeryf', naglowek: 500, kursywa: true },
  Prata: { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: false },
  Marcellus: { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: false },
  'Abril Fatface': { kategoria: 'szeryf', naglowek: 400, wagi: [400], kursywa: false },
  'Space Grotesk': { kategoria: 'bezszeryf', naglowek: 600, wagi: [400, 500, 600, 700], kursywa: false },
  Inter: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  'DM Sans': { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  Manrope: { kategoria: 'bezszeryf', naglowek: 700, kursywa: false },
  'Plus Jakarta Sans': { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  Outfit: { kategoria: 'bezszeryf', naglowek: 600, kursywa: false },
  Sora: { kategoria: 'bezszeryf', naglowek: 600, kursywa: false },
  Syne: { kategoria: 'bezszeryf', naglowek: 700, kursywa: false },
  Archivo: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  'Bricolage Grotesque': { kategoria: 'bezszeryf', naglowek: 700, kursywa: false },
  'Schibsted Grotesk': { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  'Hanken Grotesk': { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  'Work Sans': { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  Rubik: { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  Poppins: { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  Montserrat: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  Raleway: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  Lexend: { kategoria: 'bezszeryf', naglowek: 600, kursywa: false },
  Figtree: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  Urbanist: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  Unbounded: { kategoria: 'bezszeryf', naglowek: 600, kursywa: false },
  'Bebas Neue': { kategoria: 'bezszeryf', naglowek: 400, wagi: [400], kursywa: false },
  Anton: { kategoria: 'bezszeryf', naglowek: 400, wagi: [400], kursywa: false },
  Oswald: { kategoria: 'bezszeryf', naglowek: 500, kursywa: false },
  'Instrument Sans': { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  'IBM Plex Sans': { kategoria: 'bezszeryf', naglowek: 600, kursywa: true },
  Onest: { kategoria: 'bezszeryf', naglowek: 600, kursywa: false },
  Epilogue: { kategoria: 'bezszeryf', naglowek: 700, kursywa: true },
  'JetBrains Mono': { kategoria: 'mono', naglowek: 500, kursywa: true },
  'Space Mono': { kategoria: 'mono', naglowek: 700, wagi: [400, 700], kursywa: true },
  'IBM Plex Mono': { kategoria: 'mono', naglowek: 500, kursywa: true },
  Caveat: { kategoria: 'odreczny', naglowek: 600, kursywa: false },
};

const DOMYSLNY: OpisKroju = { kategoria: 'bezszeryf', naglowek: 600, kursywa: false };

const KATEGORIA_Z_KATALOGU: Record<FontKatalogu['kategoria'], OpisKroju['kategoria']> = {
  szeryfowy: 'szeryf',
  bezszeryfowy: 'bezszeryf',
  ozdobny: 'szeryf',
  monospace: 'mono',
  odreczny: 'odreczny',
};
const KATALOG = new Map(KATALOG_FONTOW.map((f) => [f.rodzina, f]));

/**
 * Jedno źródło prawdy o wagach i kursywie: KATALOG_FONTOW (tylko te pliki trafiają na hosting).
 * KROJE dokłada preferowaną wagę nagłówka; rodzina z katalogu bez wpisu w KROJE dostaje wagę z kategorii.
 */
export function opisKroju(rodzina: string): OpisKroju {
  const kat = KATALOG.get(rodzina);
  const znany = KROJE[rodzina];
  if (!kat) return znany ?? DOMYSLNY;
  const kategoria = znany?.kategoria ?? KATEGORIA_Z_KATALOGU[kat.kategoria];
  const naglowek = znany?.naglowek ?? (kategoria === 'szeryf' ? 500 : 700);
  return { kategoria, naglowek, wagi: kat.wagi, kursywa: kat.kursywa };
}

export function slugRodziny(rodzina: string): string {
  return rodzina
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const ZAPAS: Record<OpisKroju['kategoria'], string> = {
  szeryf: "Georgia,'Times New Roman',serif",
  bezszeryf: "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif",
  mono: "ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace",
  odreczny: "'Segoe Print','Bradley Hand',cursive",
};

/** Bezpieczna nazwa rodziny w CSS (model dopuszcza do 60 znaków tekstu). */
function nazwaCss(rodzina: string): string {
  return `'${rodzina.replace(/[^\p{L}\p{N} -]/gu, '')}'`;
}

export function stosFontu(rodzina: string): string {
  return `${nazwaCss(rodzina)},${ZAPAS[opisKroju(rodzina).kategoria]}`;
}

export interface PotrzebnyFont {
  rodzina: string;
  wagi: number[];
  kursywa: boolean;
}

function najblizsza(w: number, dostepne?: number[]): number {
  if (!dostepne) return w;
  return dostepne.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
}

export interface UstawieniaFontow {
  naglowki: string;
  tekst: string;
  akcent?: string;
  wagaNaglowka: number;
  wagaTekstu: number;
  wagaPogrubiona: number;
  kursywaWyroznienia: boolean;
  szeryfoweNaglowki: boolean;
  potrzebne: PotrzebnyFont[];
}

export function ustawFonty(motyw: Motyw): UstawieniaFontow {
  const n = opisKroju(motyw.fonty.naglowki);
  const t = opisKroju(motyw.fonty.tekst);
  const wagaNaglowka = najblizsza(n.naglowek, n.wagi);
  const wagaTekstu = najblizsza(400, t.wagi);
  const wagaPogrubiona = najblizsza(600, t.wagi);
  const kursywaWyroznienia = n.kategoria === 'szeryf' && n.kursywa;
  const mapa = new Map<string, PotrzebnyFont>();
  const dodaj = (rodzina: string, wagi: number[], kursywa: boolean) => {
    const f = mapa.get(rodzina) ?? { rodzina, wagi: [], kursywa: false };
    f.wagi = [...new Set([...f.wagi, ...wagi])].sort((a, b) => a - b);
    f.kursywa = f.kursywa || kursywa;
    mapa.set(rodzina, f);
  };
  dodaj(motyw.fonty.naglowki, [wagaNaglowka], kursywaWyroznienia);
  dodaj(motyw.fonty.tekst, [wagaTekstu, wagaPogrubiona], false);
  if (motyw.fonty.akcent) dodaj(motyw.fonty.akcent, [najblizsza(500, opisKroju(motyw.fonty.akcent).wagi)], false);
  return {
    naglowki: motyw.fonty.naglowki,
    tekst: motyw.fonty.tekst,
    akcent: motyw.fonty.akcent,
    wagaNaglowka,
    wagaTekstu,
    wagaPogrubiona,
    kursywaWyroznienia,
    szeryfoweNaglowki: n.kategoria === 'szeryf',
    potrzebne: [...mapa.values()],
  };
}

/**
 * Zakresy znaków jak w Google Fonts: przeglądarka pobiera plik `latin-ext` (ąćęłńóśźż) tylko wtedy,
 * gdy strona go potrzebuje, a `latin` zawsze. Publikacja kopiuje oba pliki każdej odmiany.
 */
export const ZAKRESY_FONTOW = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;
export type ZakresFontu = keyof typeof ZAKRESY_FONTOW;

/** Ścieżka pliku fontu względem bazy: <slug-rodziny>-<waga>[-italic]-<zakres>.woff2. */
export function plikFontu(rodzina: string, waga: number, kursywa: boolean, zakres: ZakresFontu = 'latin'): string {
  return `${slugRodziny(rodzina)}-${waga}${kursywa ? '-italic' : ''}-${zakres}.woff2`;
}

/** @font-face dla wszystkich potrzebnych odmian i obu zakresów. `baza` – katalog fontów widziany z pliku CSS. */
export function regulyFontFace(f: UstawieniaFontow, baza: string): string {
  const b = baza.replace(/\/$/, '');
  const reguly: string[] = [];
  for (const font of f.potrzebne) {
    for (const w of font.wagi) {
      // `kursywa` w liście fontów = odmiana italic dla każdej wymienionej wagi tej rodziny.
      const style = font.kursywa ? [false, true] : [false];
      for (const kurs of style) {
        for (const zakres of Object.keys(ZAKRESY_FONTOW) as ZakresFontu[]) {
          reguly.push(
            `@font-face{font-family:${nazwaCss(font.rodzina)};font-style:${kurs ? 'italic' : 'normal'};font-weight:${w};font-display:swap;src:url("${b}/${plikFontu(font.rodzina, w, kurs, zakres)}") format("woff2");unicode-range:${ZAKRESY_FONTOW[zakres]}}`,
          );
        }
      }
    }
  }
  return reguly.join('\n');
}

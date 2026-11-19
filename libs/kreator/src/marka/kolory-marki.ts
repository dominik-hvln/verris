/**
 * Kreator marki – kolory marki z barwy (OKLCH h) i charakteru palety: kolor główny (znak i napis), akcent (drugi
 * kanał sygnetu), akcent jasny (na kolorze głównym / ciemnym tle) i paleta strony (ten sam schemat co Motyw.paleta).
 *
 * Kontrast (WCAG 2.2, liczony z `style/kolory.ts`):
 * - kolor główny na bieli ≥ 4,5:1 – napis logo ma być czytelnym tekstem (logotypy są wyłączone z 1.4.3,
 *   ale celujemy w AA, koncepcja 3.4);
 * - akcent na bieli ≥ 3:1 – element graficzny (WCAG 1.4.11);
 * - akcent jasny na kolorze głównym ≥ 3:1 (negatyw logo).
 *
 * CMYK: `cmykOrientacyjnie` to prosta konwersja RGB → CMYK bez profilu ICC (bez zarządzania barwą). Wartości są
 * ORIENTACYJNE – do druku drukarnia powinna przeliczyć kolory swoim profilem (np. ISO Coated v2 / FOGRA39
 * [do weryfikacji z drukarnią]) i zrobić próbę. Tak opisujemy je w księdze znaku i na wizytówce.
 */
import type { KoloryMarki } from './model.ts';
import type { CharakterPalety } from '../style/katalog-stylow.ts';
import { dopasujKontrast, generujPalete, hexDoOklch, kontrast, korygujPalete, oklchDoHex } from '../style/kolory.ts';

export const MIN_KONTRAST_ZNAKU = 3;
export const MIN_KONTRAST_NAPISU = 4.5;
export const MIN_KONTRAST_AKCENTU_JASNEGO = 3;

const norm = (h: number) => ((Math.round(h) % 360) + 360) % 360;

/** Domyślna barwa akcentu: dla barw ciepłych – pokrewna (złoto do brązu), dla pozostałych – dopełniająca. */
export function domyslnaBarwaAkcentu(barwa: number): number {
  const h = norm(barwa);
  if (h >= 20 && h <= 110) return norm(h + 32);
  return norm(h + 180 - 12);
}

const PRZEPIS_GLOWNEGO: Record<CharakterPalety, { l: number; c: number }> = {
  jasna: { l: 0.38, c: 0.09 },
  ciemna: { l: 0.28, c: 0.06 },
  kontrastowa: { l: 0.26, c: 0.11 },
  pastelowa: { l: 0.42, c: 0.08 },
  ziemista: { l: 0.4, c: 0.085 },
};
const PRZEPIS_AKCENTU: Record<CharakterPalety, { l: number; c: number }> = {
  jasna: { l: 0.62, c: 0.13 },
  ciemna: { l: 0.66, c: 0.12 },
  kontrastowa: { l: 0.6, c: 0.19 },
  pastelowa: { l: 0.68, c: 0.1 },
  ziemista: { l: 0.6, c: 0.11 },
};

export interface OpcjeKolorowMarki {
  /** Barwa akcentu (OKLCH h) – gdy brak, dobrana z barwy głównej. */
  akcentBarwa?: number;
}

/** Kolory marki z barwy i charakteru – deterministyczne, zawsze z wymaganym kontrastem. */
export function koloryMarki(barwa: number, charakter: CharakterPalety, o: OpcjeKolorowMarki = {}): KoloryMarki {
  const h = norm(barwa);
  const ha = o.akcentBarwa === undefined ? domyslnaBarwaAkcentu(h) : norm(o.akcentBarwa);
  const pg = PRZEPIS_GLOWNEGO[charakter];
  const pa = PRZEPIS_AKCENTU[charakter];
  const glowny = dopasujKontrast(oklchDoHex({ l: pg.l, c: pg.c, h }), ['#FFFFFF'], MIN_KONTRAST_NAPISU);
  const akcent = dopasujKontrast(oklchDoHex({ l: pa.l, c: pa.c, h: ha }), ['#FFFFFF'], MIN_KONTRAST_ZNAKU);
  const akcentJasny = dopasujKontrast(oklchDoHex({ l: 0.82, c: Math.min(0.11, pa.c), h: ha }), [glowny], MIN_KONTRAST_AKCENTU_JASNEGO);
  const bazowa = generujPalete(ha, charakter);
  // ciemne sekcje strony w kolorze marki; tekst na nich koryguje `korygujPalete`
  const paleta = korygujPalete({ ...bazowa, ciemne: charakter === 'ciemna' ? bazowa.ciemne : glowny }).paleta;
  return { glowny, akcent, akcentJasny, paleta, barwa: h, charakter };
}

/** Kolory marki z wgranego logo / ręcznego wyboru: hex główny i akcent → korekta kontrastu i paleta. */
export function koloryZHex(glownyHex: string, akcentHex: string, charakter: CharakterPalety): KoloryMarki {
  const glowny = dopasujKontrast(glownyHex.toUpperCase(), ['#FFFFFF'], MIN_KONTRAST_NAPISU);
  const akcent = dopasujKontrast(akcentHex.toUpperCase(), ['#FFFFFF'], MIN_KONTRAST_ZNAKU);
  const a = hexDoOklch(akcent);
  const akcentJasny = dopasujKontrast(oklchDoHex({ l: 0.82, c: Math.min(0.11, a.c), h: a.h }), [glowny], MIN_KONTRAST_AKCENTU_JASNEGO);
  const barwa = norm(hexDoOklch(glowny).h);
  const bazowa = generujPalete(norm(a.h), charakter);
  const paleta = korygujPalete({ ...bazowa, ciemne: glowny }).paleta;
  return { glowny, akcent, akcentJasny, paleta, barwa, charakter };
}

export interface KontrastyMarki {
  glownyNaBieli: number;
  akcentNaBieli: number;
  akcentJasnyNaGlownym: number;
  bielNaGlownym: number;
}

export function kontrastyMarki(k: Pick<KoloryMarki, 'glowny' | 'akcent' | 'akcentJasny'>): KontrastyMarki {
  return {
    glownyNaBieli: kontrast(k.glowny, '#FFFFFF'),
    akcentNaBieli: kontrast(k.akcent, '#FFFFFF'),
    akcentJasnyNaGlownym: kontrast(k.akcentJasny, k.glowny),
    bielNaGlownym: kontrast('#FFFFFF', k.glowny),
  };
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Orientacyjny odpowiednik CMYK (procenty, liczby całkowite): naiwna konwersja K = 1 − max(R, G, B),
 * C = (1 − R − K) / (1 − K) itd. BEZ profilu ICC – nie uwzględnia przyrostu punktu, papieru ani gamutu farb.
 */
export function cmykOrientacyjnie(hex: string): Cmyk {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1 - 1e-9) return { c: 0, m: 0, y: 0, k: 100 };
  const p = (x: number) => Math.round(((1 - x - k) / (1 - k)) * 100);
  return { c: p(r), m: p(g), y: p(b), k: Math.round(k * 100) };
}

export interface OpisKoloru {
  hex: string;
  rgb: [number, number, number];
  cmyk: Cmyk;
  /** OKLCH zaokrąglone (do księgi znaku). */
  oklch: { l: number; c: number; h: number };
}

export function opisKoloru(hex: string): OpisKoloru {
  const n = parseInt(hex.slice(1), 16);
  const o = hexDoOklch(hex);
  return {
    hex: hex.toUpperCase(),
    rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
    cmyk: cmykOrientacyjnie(hex),
    oklch: { l: Math.round(o.l * 100) / 100, c: Math.round(o.c * 1000) / 1000, h: Math.round(o.h) },
  };
}

export const formatCmyk = (c: Cmyk) => `C${c.c} M${c.m} Y${c.y} K${c.k}`;

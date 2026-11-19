/**
 * Kreator marki – kontrakty między biblioteką (render), AI, API i panelem. Implementacje w osobnych plikach.
 * Zmiana tu = uzgodnienie wszystkich części.
 */
import type { ParametrySygnetu, ProjektLogo, UkladLogo } from './model.ts';

/** Parametr rodziny sygnetu (liczba całkowita w zakresie). AI dostaje zakresy w bloku M2 (generowanym z katalogu). */
export interface ParametrRodziny {
  klucz: string;
  opis: string;
  min: number;
  max: number;
  domyslna: number;
}

/** Rodzina kształtów z biblioteki Verris (ręcznie zaprojektowana gramatyka, deterministyczny generator). */
export interface RodzinaSygnetu {
  id: string;
  nazwa: string;
  /** Opis dla AI i panelu (z czego zbudowany znak, jaki charakter). */
  opis: string;
  /** Charakter (słownik CECHY_MARKI) – preselekcja serwera. */
  charakter: string[];
  /** Branże, do których rodzina pasuje szczególnie (słowa kluczowe) – tylko podpowiedź, nie ograniczenie. */
  branze?: string[];
  /** Rodzina buduje znak z liter nazwy (monogram) – wymaga `litery`. */
  monogram: boolean;
  /** Ile kanałów koloru używa (1 = tylko currentColor, 2 = + akcent). */
  kanaly: 1 | 2;
  parametry: ParametrRodziny[];
  /**
   * Geometria w viewBox 0 0 100 100: same `<path>` (wypełnienia, fill-rule evenodd), kolor główny `currentColor`,
   * akcent `var(--akcent, currentColor)` (eksport podstawia kolor). Bez masek – wycięcia jako ścieżki (druk, ploter).
   */
  rysuj(p: ParametrySygnetu, o: { litery?: string; ziarno: number; wariant: 'pelny' | 'favicon' }): string;
}

/** Glify napisu zamienione na krzywe (API: fontkit z kerningiem; jednostki = 1000 na em, linia bazowa y = 0). */
export interface KsztaltNapisu {
  /** Ścieżka SVG całego napisu w jednostkach em/1000, y w dół (linia bazowa na 0, wersaliki ok. −700). */
  d: string;
  szerokosc: number;
  /** Wysokość wersalików kroju (cap height) w tych samych jednostkach. */
  wysokoscWersalikow: number;
  /** Dolny wydłużnik (dodatni) – do obrysu. */
  zejscie: number;
}

/** Dostawca kształtów napisu (API – fontkit; panel – podgląd przez `<text>` z @font-face). */
export type KsztaltujNapis = (tekst: string, font: string, waga: number, rozstrzelenie: number) => KsztaltNapisu | null;

export const WARIANTY_KOLORU = ['kolor', 'mono', 'negatyw', 'bialy'] as const;
export type WariantKoloru = (typeof WARIANTY_KOLORU)[number];

/** Wynik złożenia logo – samodzielny SVG (z metadanymi AI) i wymiary w jednostkach viewBox. */
export interface ZlozoneLogo {
  svg: string;
  szerokosc: number;
  wysokosc: number;
  /** Pole ochronne (x) w jednostkach viewBox – do zasad marki i plansz. */
  poleOchronne: number;
}

export interface OpcjeZlozenia {
  uklad: UkladLogo;
  wariant: WariantKoloru;
  /** Kształty napisu (eksport) – bez nich napis jako `<text>` z font-family (podgląd w panelu). */
  napis?: KsztaltNapisu | null;
  /** Drugi wiersz napisu (styl „dwa”, nazwy ≥ 2 słów; teksty wierszy z `wierszeNapisu`) – dodane w A1, opcjonalne. */
  napis2?: KsztaltNapisu | null;
  podpis?: KsztaltNapisu | null;
  /** Wysokość docelowa w px – poniżej progów reguły zdejmują podpis / napis (reguly.ts). */
  wysokoscPx?: number;
  /** Metadane „wygenerowano z pomocą AI” (AI Act art. 50) – domyślnie true. */
  metadaneAi?: boolean;
  /** Wariant „negatyw”: tło w kolorze głównym z marginesem = pole ochronne (domyślnie true). Dodane w A1, opcjonalne. */
  tlo?: boolean;
}

export type ZlozLogo = (projekt: ProjektLogo, nazwa: string, podpis: string | undefined, o: OpcjeZlozenia) => ZlozoneLogo;

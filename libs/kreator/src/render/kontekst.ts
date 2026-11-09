import type { Jezyk } from '../jezyki.ts';
import type { Podstrona, Strona } from '../model.ts';
import type { WersjaKreatora } from '../plany.ts';
import type { UstawieniaFontow } from './fonty.ts';
import type { KoloryStrony } from './paleta.ts';
import type { TekstyStrony } from './teksty.ts';

export interface OpcjeRenderu {
  /** Decyduje o SEO podstawowe/pełne i noindex w próbie. */
  wersja: WersjaKreatora;
  /** Podgląd: placeholdery pustych opinii, oznaczenia „Pro” (z `podgladPro`). */
  tryb: 'podglad' | 'publikacja';
  /** W podglądzie pokaż elementy Pro ze wstęgą „Pro” zamiast je zastępować. */
  podgladPro?: boolean;
  /** https://domena.pl – canonical, og:url, sitemap; brak = ścieżki względne, bez canonical. */
  adresStrony?: string;
  /** 'assets/fonty' (publikacja, względem korzenia strony) albo pełny URL proxy fontów w podglądzie. */
  bazaFontow: string;
  /** Wymuś noindex (próba zawsze noindex). */
  noindex?: boolean;
  /**
   * Adres POST formularza kontaktowego (API: …/kreator/formularz/<token>) – podaje go publikacja na domenę i ZIP.
   * Brak = formularz wyłączony z informacją „Formularz zadziała po publikacji strony” (podgląd edytora, link próbny).
   */
  adresFormularza?: string;
  /** ISO – deterministyczne testy (rok w stopce, lastmod). */
  dataGeneracji?: string;
  /**
   * Edycja na stronie (tylko tryb 'podglad'): teksty dostają `data-k` (ścieżka w modelu) i `data-k-max` (limit ze
   * schematu), sekcje `data-k-sekcja`. Publikacja nigdy – renderer ignoruje tę opcję poza podglądem.
   */
  edycja?: boolean;
  /**
   * Paczka 122 – adres pliku wariantu zdjęcia z biblioteki (`Obraz.zasobId`): podgląd – podpisany adres API
   * (…/kreator/z/<token>/<szer>.<format>), publikacja – 'assets/img/<zasobId>-<szer>.<format>' (względnie).
   * Brak w publikacji przy obrazie z `zasobId` = błąd renderu (nie cicha ramka zastępcza).
   */
  adresZasobu?: (zasobId: string, szerokosc: number, format: 'webp' | 'jpg') => string;
}

export interface PlikStrony {
  sciezka: string;
  tresc: string;
  typ: string;
}

export interface WynikRenderu {
  pliki: PlikStrony[];
  fonty: { rodzina: string; wagi: number[]; kursywa: boolean }[];
  ostrzezenia: string[];
}

/** Indeksy podstron i sekcji w modelu z edytora (slug → indeks podstrony, id sekcji → indeks sekcji). */
export interface EdycjaStrony {
  model: Strona;
  strony: Map<string, { i: number; sekcje: Map<string, number> }>;
}

/** Stan wspólny dla całego renderu (wszystkie podstrony). */
export interface KontekstStrony {
  strona: Strona;
  opcje: OpcjeRenderu;
  seoPelne: boolean;
  podglad: boolean;
  /** Pokazuj elementy Pro ze wstęgą (podgląd z podgladPro w wersji bez Pro). */
  wstegaPro: boolean;
  efekty: Set<string>;
  kolory: KoloryStrony;
  fonty: UstawieniaFontow;
  /** Moduły CSS do dołączenia (np. 'w:hero-podzielony', 'ef:tasma'). */
  css: Set<string>;
  /** Moduły JS do dołączenia. */
  js: Set<string>;
  ostrzezenia: string[];
  /** Id sekcji stron głównych (adres strony głównej języka → id), które faktycznie się renderują (do linków z podstron). */
  idGlownych: Map<string, Set<string>>;
  adres: string | null;
  /** Edycja na stronie: model z edytora (ścieżki wskazują jego pola, nie kopię po dopasowaniu do planu). */
  edycja: EdycjaStrony | null;
  rok: number;
  dataIso: string;
}

/** Stan jednej podstrony. */
export interface KontekstPodstrony {
  s: KontekstStrony;
  podstrona: Podstrona;
  /** Ścieżka do korzenia strony z tej podstrony ('' albo '../' albo '../../'). */
  prefix: string;
  idTutaj: Set<string>;
  /** Paczka 124 – język podstrony, jego teksty systemowe, adres jego strony głównej ('' albo 'en') i jej sekcje. */
  jezyk: Jezyk;
  t: TekstyStrony;
  glowna: string;
  idGlownej: Set<string>;
  licznikObrazow: number;
  licznikPh: number;
  bylH1: boolean;
}

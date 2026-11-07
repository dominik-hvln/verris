import type { Podstrona, Strona } from '../model.ts';
import type { WersjaKreatora } from '../plany.ts';
import type { UstawieniaFontow } from './fonty.ts';
import type { KoloryStrony } from './paleta.ts';

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
  /** ISO – deterministyczne testy (rok w stopce, lastmod). */
  dataGeneracji?: string;
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
  /** Id sekcji strony głównej, które faktycznie się renderują (do linków z podstron). */
  idGlownej: Set<string>;
  adres: string | null;
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
  licznikObrazow: number;
  licznikPh: number;
  bylH1: boolean;
}

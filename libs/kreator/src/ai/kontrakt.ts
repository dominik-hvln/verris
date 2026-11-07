import type { Firma, Strona, TypSekcji, WynikWalidacji } from '../model.ts';
import type { WersjaKreatora } from '../plany.ts';

/**
 * Kontrakt między master promptem (libs/kreator/src/ai) a API (apps/api/src/kreator).
 * API nie składa promptów samo – woła te funkcje i wysyła wynik do Anthropic Messages API
 * z `cache_control` na blokach systemu oznaczonych `cache`.
 */
export interface BlokSystemu {
  tekst: string;
  /** Punkt cache (prompt caching): '1h' dla stałego master promptu, '5m' dla bloków zmiennych rzadziej niż zapytanie. */
  cache: '1h' | '5m' | null;
}

export interface WiadomoscAi {
  role: 'user' | 'assistant';
  content: string;
}

export interface ZapytanieAi {
  system: BlokSystemu[];
  wiadomosci: WiadomoscAi[];
  maxTokens: number;
  /** Do logów i rozliczeń (np. 'generacja-pro', 'zmiana-lite'). */
  rodzaj: string;
}

export const TYPY_STRON = ['wizytowka', 'landing', 'sklep', 'portfolio', 'blog', 'inna'] as const;
export type TypStrony = (typeof TYPY_STRON)[number];

/** Co klient podaje w kreatorze przed generacją (formularz „opisz firmę”). */
export interface BriefStrony {
  /** Swobodny opis firmy i strony (do 3000 znaków). */
  opis: string;
  typ: TypStrony;
  firma?: Partial<Firma>;
  /** Ceny podane przez klienta – AI może je przepisać, nigdy wymyślić. */
  ceny?: string;
  /** Ton komunikacji wybrany w kreatorze, np. 'ciepły', 'ekspercki', 'luksusowy', 'młodzieżowy'. */
  ton?: string;
  /** Preferowany kierunek stylu z katalogu (opcjonalnie). */
  styl?: string;
  /** Strony wzorcowe / inspiracje opisane słowami (bez pobierania cudzych stron). */
  inspiracje?: string;
}

/** Kierunek projektu wybrany przed generacją przez serwer (unikalność i różnorodność), nie przez AI. */
export interface KierunekProjektu {
  styl: string;
  fonty: { naglowki: string; tekst: string };
  /** Bazowa barwa akcentu (0–359) i charakter palety – AI dobiera resztę w ramach reguł kontrastu. */
  barwa: number;
  charakterPalety: 'jasna' | 'ciemna' | 'kontrastowa' | 'pastelowa' | 'ziemista';
  /** Wariant układu dla kluczowych typów sekcji. */
  warianty: Partial<Record<TypSekcji, string>>;
  zaokraglenie: 'ostre' | 'lekkie' | 'miekkie' | 'pelne';
  skalaTypografii: 'spokojna' | 'wyrazista' | 'monumentalna';
}

export interface FunkcjeAiKreatora {
  budujZapytanieGeneracji(brief: BriefStrony, wersja: WersjaKreatora, kierunek: KierunekProjektu): ZapytanieAi;
  /** Zmiana całej strony (sekcjaId = null) albo jednej sekcji poleceniem klienta. */
  budujZapytanieZmiany(strona: Strona, polecenie: string, sekcjaId: string | null, wersja: WersjaKreatora): ZapytanieAi;
  /** Jedna runda naprawy po błędach walidacji (dokleja się do rozmowy). */
  wiadomosciNaprawy(odpowiedz: string, bledy: string[]): WiadomoscAi[];
  /**
   * `brief` (zalecany) – pozwala odrzucić ceny spoza briefu i usunąć dane kontaktowe, których klient
   * nie podał. Bez briefu te dwie kontrole są pomijane.
   */
  odczytajWynikGeneracji(tekst: string, wersja: WersjaKreatora, brief?: BriefStrony): WynikWalidacji;
  odczytajWynikZmiany(strona: Strona, tekst: string, sekcjaId: string | null, wersja: WersjaKreatora): WynikWalidacji;
  /**
   * `odciskiNiedawne` – odciski ostatnich stron tej branży; `los` – wstrzykiwalne źródło losowości (testy);
   * `wersja` – bez Kreatora Pro tylko style `pro: false` (domyślnie wersja bez Pro).
   */
  wybierzKierunki(brief: BriefStrony, ile: number, odciskiNiedawne: string[], los?: () => number, wersja?: WersjaKreatora): KierunekProjektu[];
  /** Odcisk projektu (styl + fonty + kluczowe warianty) do unikania powtórek. */
  odciskStrony(strona: Strona): string;
}

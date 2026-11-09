/**
 * Verris Kreator – generowanie zdjęć przez AI (paczka 124). Dostawcy obrazów są adapterami za jednym interfejsem
 * (jak biblioteki zdjęć w ../biblioteka): Black Forest Labs FLUX (domyślny, bfl.ts) i OpenAI Images (openai-obrazy.ts,
 * wyłączony bez klucza). Do dostawcy trafia wyłącznie angielski opis obrazu zbudowany po stronie serwera
 * (prompt-obrazu.ts) – bez danych konta i bez treści strony.
 */
import type { Obraz } from '@verris/kreator';
import type { DostawcaObrazowAi } from '../konfiguracja.js';
import type { Fetch } from '../biblioteka/dostawca.js';

export type Proporcje = Obraz['proporcje'];

export interface WygenerowanyObraz {
  dane: Buffer;
}

export interface ZlecenieObrazow {
  prompt: string;
  proporcje: Proporcje;
  ile: number;
  model: string;
  /** Wspólny termin całej generacji (wszystkie warianty) – po nim BladGeneratora('czas'). */
  sygnal: AbortSignal;
}

/**
 * Wynik jednej generacji: udane obrazy i liczba obrazów, za które dostawca policzy (zlecenia przyjęte przez API –
 * także odrzucone potem przez moderację; ostrożnie: lepiej przeszacować koszt niż go zaniżyć).
 */
export interface WynikGeneracji {
  obrazy: WygenerowanyObraz[];
  rozliczone: number;
  /** Ile wariantów odrzuciła moderacja dostawcy. */
  moderowane: number;
}

export interface GeneratorObrazow {
  readonly nazwa: DostawcaObrazowAi;
  /** Dostawca ma klucz API. */
  wlaczony(): boolean;
  readonly f: Fetch;
  generuj(z: ZlecenieObrazow): Promise<WynikGeneracji>;
}

export type KodBleduGeneratora = 'moderacja' | 'czas' | 'blad' | 'limit' | 'wylaczony';

/** Błąd dostawcy obrazów – `message` po polsku dla klienta (white label, bez nazwy dostawcy), szczegóły do logu. */
export class BladGeneratora extends Error {
  constructor(
    readonly kod: KodBleduGeneratora,
    message: string,
    readonly szczegoly = '',
    /** Ile obrazów dostawca policzy mimo błędu (zlecenia przyjęte przed błędem). */
    readonly rozliczone = 0,
  ) {
    super(message);
  }
}

export const KOMUNIKATY_GENERATORA: Record<KodBleduGeneratora, string> = {
  moderacja: 'Tego zdjęcia nie możemy wygenerować – opis narusza zasady generowania obrazów. Opisz scenę inaczej.',
  czas: 'Generowanie trwało zbyt długo – spróbuj ponownie za chwilę.',
  blad: 'Generowanie zdjęć jest chwilowo niedostępne – spróbuj ponownie za chwilę.',
  limit: 'Generator zdjęć ma teraz za dużo zleceń – spróbuj za minutę.',
  wylaczony: 'Generowanie zdjęć będzie dostępne wkrótce.',
};

export const blad = (kod: KodBleduGeneratora, szczegoly = '', rozliczone = 0) => new BladGeneratora(kod, KOMUNIKATY_GENERATORA[kod], szczegoly, rozliczone);

/**
 * Wymiary dla FLUX1.1 [pro]: wielokrotności 32, bok 256–1440 px (do sprawdzenia z dokumentacją BFL przy wdrożeniu).
 * Proporcje jak najbliżej modelu Obraz przy ok. 1–1,5 Mpx; resztę kadru robi renderer (object-fit + ogniskowa).
 */
export const WYMIARY_BFL: Record<Proporcje, { width: number; height: number }> = {
  '16:9': { width: 1408, height: 800 },
  '4:3': { width: 1280, height: 960 },
  '3:2': { width: 1440, height: 960 },
  '1:1': { width: 1216, height: 1216 },
  '3:4': { width: 960, height: 1280 },
  '4:5': { width: 1024, height: 1280 },
};

/** OpenAI gpt-image-1 ma trzy rozmiary (do sprawdzenia z dokumentacją): poziomy, kwadrat, pionowy. */
export function rozmiarOpenAi(p: Proporcje): '1536x1024' | '1024x1024' | '1024x1536' {
  if (p === '1:1') return '1024x1024';
  return p === '3:4' || p === '4:5' ? '1024x1536' : '1536x1024';
}

/** Maksymalny rozmiar pobieranego obrazu wynikowego. */
export const MAKS_BAJTOW_WYNIKU = 15 * 1024 * 1024;

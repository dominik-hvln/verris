import { ServiceUnavailableException } from '@nestjs/common';
import type { MigawkaMarki } from '@verris/kreator';

/**
 * Paczka 130 – dostawca marki dla Kreatora stron. Kreator stron nie zna tabel marki: pyta dostawcę o marki konta i o
 * migawkę wybranej marki (logo SVG po złożeniu, favicon, kolory, paleta, fonty – `MigawkaMarki` z @verris/kreator,
 * do zbudowania z modelu marki przez `migawkaZMarki`). Moduł Kreatora marki (faza 2) podepnie prawdziwą implementację
 * pod token DOSTAWCA_MARKI; do tego czasu działa `BrakModuluMarki`.
 */
export const DOSTAWCA_MARKI = Symbol('DOSTAWCA_MARKI');

/** Marka konta na liście w edytorze strony (bez plików). */
export interface MarkaKonta {
  markaId: string;
  nazwa: string;
  /** Bieżąca wersja marki (każdy zapis marki ją podbija) – porównanie z migawką na stronie. */
  wersja: number;
}

export interface DostawcaMarki {
  /** Czy moduł Kreatora marki jest dostępny dla konta (włączony w adminie, konto z dostępem). */
  dostepna(userId: string): Promise<boolean>;
  /** Marki konta (najnowsze pierwsze). */
  lista(userId: string): Promise<MarkaKonta[]>;
  /**
   * Migawka marki konta w bieżącej wersji; null = konto nie ma takiej marki (404). Migawka może przyjść z dowolnego
   * źródła – serwis i tak sprawdza ją schematem `MigawkaMarki` (SVG z białej listy) przed zastosowaniem.
   */
  migawka(userId: string, markaId: string): Promise<MigawkaMarki | null>;
}

export const MARKA_NIEDOSTEPNA = 'Kreator marki niedostępny.';

/** Moduł Kreatora marki jeszcze nie istnieje: marka niedostępna, lista pusta, migawka – 503 z polskim komunikatem. */
export class BrakModuluMarki implements DostawcaMarki {
  async dostepna(): Promise<boolean> {
    return false;
  }

  async lista(): Promise<MarkaKonta[]> {
    return [];
  }

  async migawka(): Promise<MigawkaMarki | null> {
    throw new ServiceUnavailableException(MARKA_NIEDOSTEPNA);
  }
}

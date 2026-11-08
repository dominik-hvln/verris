/**
 * Paczka 122 – typy odpowiedzi API biblioteki zdjęć kreatora (apps/api/src/kreator/zasoby.service.ts).
 * Moduł bez 'use client' i bez 'use server' – współdzielony przez dialog, akcje i trasę wgrywania.
 */

export type ZrodloZasobu = 'wlasne' | 'pixabay' | 'openverse' | 'pexels' | 'ai';
export type DostawcaZdjec = 'pixabay' | 'openverse' | 'pexels';

export interface ZasobKreatora {
  id: string;
  zrodlo: ZrodloZasobu;
  autor: string | null;
  licencja: string | null;
  licencjaUrl: string | null;
  zrodloUrl: string | null;
  szerokosc: number;
  wysokosc: number;
  bajty: number;
  alt: string | null;
  createdAt: string;
  /** Bazowy adres plików wariantów w API (…/kreator/z/<token>/) – dalej `<szer>.<webp|jpg>`. */
  adres: string;
  miniatura: string;
}

export interface ListaZasobow {
  zasoby: ZasobKreatora[];
  razem: number;
  strona: number;
  naStrone: number;
  miejsce: { zajete: number; limit: number };
}

export interface WynikBiblioteki {
  id: string;
  /** Miniatura przez proxy API (nie adres dostawcy). */
  miniatura: string;
  szerokosc: number;
  wysokosc: number;
  autor: string;
  autorUrl?: string;
  licencja: string;
  licencjaUrl?: string;
  zrodloUrl: string;
}

export interface OdpowiedzBiblioteki {
  dostawcy: { id: DostawcaZdjec; nazwa: string }[];
  dostawca: DostawcaZdjec | null;
  zrodlo?: string;
  wyniki: WynikBiblioteki[];
  razem: number;
  strona: number;
  naStrone: number;
}

/** Limity wgrywania – te same co w API (zasoby-obraz.ts); w panelu tylko szybka odmowa przed wysłaniem. */
export const MAKS_BAJTOW_ZDJECIA = 15 * 1024 * 1024;
export const TYPY_ZDJEC = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Nazwa licencji dla klienta. */
export function nazwaLicencji(kod: string | null | undefined): string {
  switch ((kod ?? '').toLowerCase()) {
    case 'cc0':
      return 'CC0 (domena publiczna)';
    case 'pdm':
      return 'Domena publiczna';
    case 'pixabay':
      return 'Licencja Pixabay';
    case 'pexels':
      return 'Licencja Pexels';
    case '':
      return 'Twoje zdjęcie';
    default:
      return kod!.toUpperCase();
  }
}

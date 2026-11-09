/**
 * Verris Kreator na verris.pl (paczka 123): limity wersji „w cenie hostingu”, „Kreator Pro” i okresu próbnego.
 *
 * Źródło prawdy: libs/kreator/src/plany.ts (PLANY_KREATORA) i apps/api/src/kreator/publikacja.service.ts
 * (WAZNOSC_LINKU_MS). www nie zależy od paczki @verris/kreator (źródłowy TS z zod, importy `.ts`), więc liczby są tu
 * przepisane – test kreator.spec.ts czyta oba pliki i czerwieni się przy każdym rozjeździe.
 * Ceny Kreatora Pro NIE są tutaj: idą z API (lib/ceny – plan kreator-pro), jak wszystkie ceny na stronie.
 *
 * Czego tu celowo nie ma (stan kodu 9.11.2026): przejścia na WordPressa – nie obiecujemy go na www.
 * Paczka 124: wersje językowe działają w Kreatorze Pro (PlanKreatora.wielojezycznosc, języki z modelu: en, de, uk).
 */

import { plForm } from './pl';

export type LimityKreatora = {
  /** Strony (projekty) na koncie. */
  stron: number;
  /** Podstrony w jednej stronie; null = bez limitu. */
  podstron: number | null;
  /** Generacje całej strony przez AI w miesiącu. */
  generacjiMies: number;
  /** Zmiany AI (sekcja, ton, przegląd) w miesiącu. */
  zmianAiMies: number;
  /** Propozycje projektu z jednej generacji. */
  wariantyGeneracji: number;
  /** Wersje językowe strony (podstrony w innych językach, przełącznik języka) – PlanKreatora.wielojezycznosc. */
  wielojezycznosc: boolean;
};

/** Języki dodatkowe w Kreatorze Pro – libs/kreator/src/jezyki.ts (JEZYKI_DODATKOWE: en, de, uk), nazwy po polsku. */
export const JEZYKI_KREATORA_PRO = ['angielski', 'niemiecki', 'ukraiński'] as const;

export const LIMITY_KREATORA: Record<'proba' | 'hosting' | 'pro', LimityKreatora> = {
  proba: { stron: 1, podstron: 5, generacjiMies: 1, zmianAiMies: 20, wariantyGeneracji: 1, wielojezycznosc: false },
  hosting: { stron: 3, podstron: 5, generacjiMies: 3, zmianAiMies: 200, wariantyGeneracji: 1, wielojezycznosc: false },
  pro: { stron: 10, podstron: null, generacjiMies: 10, zmianAiMies: 1000, wariantyGeneracji: 3, wielojezycznosc: true },
};

/** Link podglądu w okresie próbnym: ważny tyle dni, odnawiany, niewidoczny dla wyszukiwarek. */
export const DNI_LINKU_PODGLADU = 7;

/** Zakup Kreatora Pro w panelu (karta kreatora; strona zakupu wymaga logowania). */
export const KREATOR_W_PANELU = 'https://panel.verris.pl/dashboard/kreator';

/** Zrzuty przykładowych stron (public/kreator, WebP 640 i 1280 px, kadr 1280×1040 z górnej części strony). */
export type PrzykladStrony = { plik: string; firma: string; wersja: string; alt: string };

export const PRZYKLADY_STRON: PrzykladStrony[] = [
  {
    plik: 'przyklad-ksiegowa',
    firma: 'Biuro rachunkowe',
    wersja: 'W cenie hostingu',
    alt: 'Strona biura rachunkowego: nagłówek „Księgowość, o której nie musisz myśleć” i formularz kontaktowy obok',
  },
  {
    plik: 'przyklad-salon',
    firma: 'Salon fryzjerski',
    wersja: 'Kreator Pro – karuzela galerii',
    alt: 'Strona salonu fryzjerskiego: nagłówek „Dobre cięcie zaczyna się od rozmowy”, godziny otwarcia i cennik usług',
  },
  {
    plik: 'przyklad-ceramika',
    firma: 'Pracownia ceramiki',
    wersja: 'Kreator Pro – katalog produktów',
    alt: 'Strona pracowni ceramiki: nagłówek „Naczynia, które powstają powoli” i katalog naczyń z cenami',
  },
  {
    plik: 'przyklad-studio',
    firma: 'Studio projektowania wnętrz',
    wersja: 'Kreator Pro – karuzela realizacji i blog',
    alt: 'Strona studia wnętrz: nagłówek „Wnętrza, w których dobrze się mieszka” i karuzela realizacji',
  },
];

/** Liczebnik do tekstów: „3 strony”, „5 podstron”, „1000 zmian”; null → „bez limitu”. */
export function ileLubBezLimitu(n: number | null, jedna: string, kilka: string, wiele: string): string {
  return n === null ? 'bez limitu' : `${n.toLocaleString('pl-PL')} ${plForm(n, jedna, kilka, wiele)}`;
}

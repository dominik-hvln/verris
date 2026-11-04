/**
 * P5-01 — wejście `@verris/contracts/klient` dla panelu klienta (kod, który trafia do przeglądarki klienta).
 *
 * Eksport główny (`index.ts`) zbiera też moduły operatora: runbooki, pomoc admina, usługi i dostęp do węzła,
 * aktualizacje węzła, regiony centrów danych i wzorzec white label (lista ukrywanych nazw). Panel importujący
 * z „beczki” wysyłał je każdemu zalogowanemu klientowi w JS. Tu są tylko moduły bezpieczne dla klienta.
 *
 * Moduły z samymi typami — `export type *` (bundler ich nie ładuje). Nowy moduł dopisujesz tutaj świadomie;
 * strażnik `apps/client-panel/src/lib/bundel-klienta.spec.ts` czyta całe drzewo tego pliku i czerwieni się na
 * nazwach zaplecza, ścieżkach węzła i miastach centrów danych.
 */
export * from './panel-preferences.ts';
export * from './registrar.dto.ts';
export * from './invoice.dto.ts';
export * from './credits.ts';
export * from './blad-sieci.ts';
export * from './bledy-klienta.ts';
export * from './mail-limits.ts';
export * from './lokalizacja-klienta.ts';
export * from './etykiety.ts';
export * from './sciezka-api.ts';
export * from './kopie.ts';
export * from './limity-indywidualne.ts';
export * from './beta-scenariusze.ts';
export * from './okres-probny.ts';
export type * from './domain.dto.ts';
export type * from './wallet.dto.ts';
export type * from './plan.dto.ts';
export type * from './plan-change.dto.ts';
export type * from './subscription.dto.ts';
export type * from './ai.dto.ts';

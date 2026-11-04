/**
 * P1-14 / P2-04 (beta 3.11) i decyzja 4 Dominika: jedno zdanie o fakturach — to samo w zamówieniu, w Płatnościach
 * i na liście faktur. Zgodne z modelem w API: dokument powstaje przy realnej wpłacie
 * (`apps/api/src/billing/tryb-fakturowania.ts`, model `przy_doladowaniu`), wydanie kredytów z portfela dokumentu
 * nie tworzy, a kredyty z kodu promocyjnego (np. kod testera BETA) nie są wpłatą — nie ma za nie faktury.
 * Bez nazw operatorów płatności w tekście dla klienta.
 */
export const ZASADA_FAKTUR =
  'Fakturę wystawiamy przy każdej wpłacie pieniędzy: doładowaniu portfela, zapłacie za usługę BLIK-iem lub przelewem ' +
  'i każdym pobraniu z karty. Zakup usługi z portfela nie tworzy nowej faktury, bo rozlicza go faktura za doładowanie.';

export const ZASADA_KREDYTOW_Z_KODU =
  'Kredyty z kodu promocyjnego (także z kodu testera) to nie zakup, więc nie ma za nie faktury.';

/**
 * P2-12 — jak odstąpić od umowy z poziomu panelu (Regulamin §21 ust. 2: „w Panelu, e-mailem albo pisemnie”).
 * Kanał w panelu = zgłoszenie w Centrum pomocy, tak jak reklamacja (§20 ust. 1).
 */
export const JAK_ODSTAPIC =
  'Masz 14 dni od zamówienia na odstąpienie od umowy bez podania przyczyny (konsument i przedsiębiorca na prawach ' +
  'konsumenta). Wystarczy zgłoszenie w Centrum pomocy (Wsparcie → Nowe zgłoszenie) albo e-mail na kontakt@verris.pl. ' +
  'Wzór oświadczenia jest w Załączniku 1 do Regulaminu, ale nie musisz z niego korzystać. Za czas, w którym usługa ' +
  'już działała, zapłacisz proporcjonalnie, a resztę zwrócimy w ciągu 14 dni.';

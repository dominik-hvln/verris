/**
 * Klasy przycisków i pól Verris Kreatora – moduł BEZ 'use client', żeby komponenty serwerowe (lista stron, brak
 * dostępu, zakup Kreatora Pro) dostawały napis, a nie referencję klienta (strażnik granica-serwer-klient.spec.ts).
 * wspolne.tsx re-eksportuje je dla komponentów klienckich.
 *
 * Paczka 123 – cel dotykowy: na ekranach < 768 px (max-md) pola i przyciski mają co najmniej 44 px wysokości
 * (WCAG 2.5.5, wytyczne Apple/Google), a pole ma 16 px tekstu (iOS nie powiększa wtedy strony przy fokusie). Pole
 * rośnie przez padding (24 px linii + 2 × 10 px + ramka = 46 px), nie przez min-height – textarea z własnym
 * `min-h-[84px]` nie może dostać mniejszej minimalnej wysokości z wariantu max-md.
 * Od 768 px wymiary jak wcześniej – gęstość edytora na komputerze bez zmian.
 */

export const klasaPola =
  'w-full rounded-[7px] border border-line-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-data aria-[invalid=true]:border-crit max-md:py-2.5 max-md:text-base';

export const klasaPrzyciskuGlownego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11';

export const klasaPrzyciskuDrugiego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11';

export const klasaPrzyciskuIkony =
  'inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 max-md:w-11';

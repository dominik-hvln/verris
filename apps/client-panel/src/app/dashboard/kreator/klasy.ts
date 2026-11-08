/**
 * Klasy przycisków i pól Verris Kreatora – moduł BEZ 'use client', żeby komponenty serwerowe (lista stron, brak
 * dostępu, zakup Kreatora Pro) dostawały napis, a nie referencję klienta (strażnik granica-serwer-klient.spec.ts).
 * wspolne.tsx re-eksportuje je dla komponentów klienckich.
 */

export const klasaPola =
  'w-full rounded-[7px] border border-line-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-data aria-[invalid=true]:border-crit';

export const klasaPrzyciskuGlownego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:cursor-not-allowed disabled:opacity-50';

export const klasaPrzyciskuDrugiego =
  'inline-flex items-center justify-center gap-2 rounded-[7px] border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50';

export const klasaPrzyciskuIkony =
  'inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

import type { ReactNode } from 'react';

/** Trzy kroki migracji — wspólne dla /przenies-strone, /hosting/wordpress i /hosting/sklep (jedna treść, jeden JSON-LD HowTo). */
export const KROKI_MIGRACJI: { label: string; title: string; text: ReactNode }[] = [
  {
    label: '01',
    title: 'Zamów hosting Verris',
    text: 'Załóż konto i wybierz rozliczenie — 45 zł/mies lub 449 zł/rok brutto. Płatność kartą, BLIK-iem albo przelewem online. Twoja obecna strona dalej działa.',
  },
  {
    label: '02',
    title: 'Wybierz sposób migracji',
    text: 'Przekaż dostępy do obecnego hostingu, a my bezpłatnie przeniesiemy pliki, bazy danych i pocztę. Wolisz mieć wszystko pod kontrolą? Uruchom darmowy migrator w panelu.',
  },
  {
    label: '03',
    title: 'Przełącz DNS i gotowe',
    text: 'Sprawdzasz stronę na nowym serwerze, zmieniasz rekordy DNS — i to wszystko. Stara strona działa do momentu przełączenia, więc odwiedzający nie zobaczą żadnej przerwy.',
  },
];

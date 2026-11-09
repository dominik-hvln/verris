import { KreatorCmsStan } from '@verris/database';

/** Stany przejścia na CMS, w których kreator nie publikuje na domenę (WordPress jest albo zaraz będzie w katalogu strony). */
export const STANY_BLOKUJACE_PUBLIKACJE: KreatorCmsStan[] = [KreatorCmsStan.ZAMIANA_W_TOKU, KreatorCmsStan.PRZENIESIONA, KreatorCmsStan.COFANIE_W_TOKU];

export const POWOD_PRZENIESIONA =
  'Ta strona działa już w WordPressie – kreator nie publikuje na tę domenę. Zmiany wprowadzaj w WordPressie albo cofnij przejście w oknie publikacji (sekcja „Przejdź na CMS”).';

const FOKUSOWALNE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * P-12 (WCAG 2.4.3) — okno modalne trzyma fokus u siebie: Tab z ostatniego elementu wraca na
 * pierwszy, Shift+Tab z pierwszego na ostatni. Bez tego klawiatura wychodzi z okna na stronę pod
 * spodem, której nie widać spod przyciemnienia. Wołane z nasłuchu `keydown` okna (obok Esc).
 */
export function trzymajFokusWOknie(e: KeyboardEvent, okno: HTMLElement | null) {
  if (e.key !== 'Tab' || !okno) return;
  const elementy = [...okno.querySelectorAll<HTMLElement>(FOKUSOWALNE)];
  if (elementy.length === 0) return;
  const pierwszy = elementy[0];
  const ostatni = elementy[elementy.length - 1];
  const aktywny = document.activeElement;
  // Fokus na samym kontenerze (tabIndex=-1 zaraz po otwarciu) albo poza nim liczy się jak „poza” listą.
  const poza = aktywny === okno || !okno.contains(aktywny);
  if (e.shiftKey && (aktywny === pierwszy || poza)) {
    e.preventDefault();
    ostatni.focus();
  } else if (!e.shiftKey && (aktywny === ostatni || poza)) {
    e.preventDefault();
    pierwszy.focus();
  }
}

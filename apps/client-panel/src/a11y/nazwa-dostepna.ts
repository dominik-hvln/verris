import axe from 'axe-core';

/**
 * Nazwa dostępna elementu (accname) — to, co czytnik ekranu ogłasza jako nazwę pola. Liczy ją axe-core
 * (implementacja W3C accname), więc test nie zgaduje po atrybutach, tylko sprawdza wynik algorytmu:
 * `aria-labelledby` → `aria-label` → `<label for>` → …
 */
type Commons = { text: { accessibleText(el: Element): string } };

export function nazwaDostepna(el: Element): string {
  axe.setup(el.ownerDocument.documentElement);
  try {
    return (axe as unknown as { commons: Commons }).commons.text.accessibleText(el).replace(/\s+/g, ' ').trim();
  } finally {
    axe.teardown();
  }
}

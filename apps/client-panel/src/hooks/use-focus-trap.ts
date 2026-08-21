'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * EAA/WCAG 2.4.3 — pułapka fokusa dla modali:
 *  - Tab/Shift+Tab krąży wewnątrz dialogu,
 *  - fokus startuje na pierwszym elemencie fokusowalnym,
 *  - po zamknięciu fokus wraca do elementu, który otworzył dialog,
 *  - Escape wywołuje `onEscape` (jeśli podano).
 *
 * Użycie: const ref = useFocusTrap<HTMLDivElement>(open, { onEscape });
 * i podpięcie `ref` do kontenera dialogu.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  opts?: { onEscape?: () => void },
) {
  const containerRef = useRef<T | null>(null);
  const onEscapeRef = useRef(opts?.onEscape);
  onEscapeRef.current = opts?.onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Fokus na pierwszy element (lub kontener) po otwarciu.
    const first = focusables()[0];
    (first ?? container).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || activeEl === container)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // WCAG: fokus wraca do wyzwalacza po zamknięciu dialogu.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return containerRef;
}

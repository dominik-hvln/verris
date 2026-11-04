'use client';

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { FOKUSOWALNE, trzymajFokusWOknie } from './fokus-okna';

/** Poniżej `lg` (1024 px) menu boczne panelu jest szufladą — tak samo jak klasy `max-lg:` w layoucie. */
export const ZAPYTANIE_SZUFLADY = '(max-width: 1023.98px)';

function subskrybuj(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const m = window.matchMedia(ZAPYTANIE_SZUFLADY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
const odczytaj = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(ZAPYTANIE_SZUFLADY).matches : false);

/**
 * A3-3 (WCAG 2.4.3, 2.4.7, 4.1.2) — szuflada menu panelu na telefonie i przy powiększeniu ≥150%:
 * zamknięta jest `inert` (wcześniej 9 niewidocznych linków łapało fokus), otwarta przenosi fokus na pierwszy element,
 * trzyma Tab u siebie jak `PanelModal`, Esc zamyka i oddaje fokus przyciskowi ☰ (`aria-expanded`, `aria-controls`).
 */
export function useSzufladaMenu(
  open: boolean,
  zamknij: () => void,
  szuflada: RefObject<HTMLElement | null>,
  przycisk: RefObject<HTMLButtonElement | null>,
  id = 'menu-panelu',
) {
  const zamknijRef = useRef(zamknij);
  useEffect(() => {
    zamknijRef.current = zamknij;
  });
  // Serwer i hydratacja: jak desktop (bez inert); zaraz potem wartość z przeglądarki.
  const szufladaAktywna = useSyncExternalStore(subskrybuj, odczytaj, () => false);
  const modalna = szufladaAktywna && open;

  useEffect(() => {
    if (!modalna) return;
    const okno = szuflada.current;
    const wyzwalacz = przycisk.current;
    okno?.querySelector<HTMLElement>(FOKUSOWALNE)?.focus();
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        zamknijRef.current();
      } else trzymajFokusWOknie(e, okno);
    };
    window.addEventListener('keydown', klawisz);
    return () => {
      window.removeEventListener('keydown', klawisz);
      // Fokus został w zamykanej szufladzie (Esc, „Zamknij menu”) albo zginął — wraca na ☰.
      const aktywny = document.activeElement;
      if (!aktywny || aktywny === document.body || okno?.contains(aktywny)) wyzwalacz?.focus();
    };
  }, [modalna, szuflada, przycisk]);

  return {
    atrybutySzuflady: {
      id,
      inert: szufladaAktywna && !open ? true : undefined,
      ...(modalna ? { role: 'dialog' as const, 'aria-modal': true as const, 'aria-label': 'Menu panelu' } : {}),
    },
    atrybutyPrzycisku: { 'aria-expanded': open, 'aria-controls': id },
  };
}

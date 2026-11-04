'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Atrybut na <html>, gdy formularz jest na ekranie — CSS (globals.css) chowa wtedy pływające elementy na telefonie. */
export const ATRYBUT_FORMULARZA = 'data-formularz-widoczny';

/** Czy któryś z obserwowanych formularzy jest choć trochę na ekranie. */
export function formularzWidoczny(wpisy: Map<Element, boolean>): boolean {
  for (const widac of wpisy.values()) if (widac) return true;
  return false;
}

/**
 * P4-6 (beta 3.11): na telefonie pasek ceny (MobilnyPasek) i okrągły przycisk „Preferencje cookies” zasłaniały pola
 * i przycisk „Poproś o telefon”. Gdy dowolny formularz strony jest w widoku, oba ustępują (CSS po atrybucie na <html>).
 * Preferencje cookies są cały czas w stopce. Bez IntersectionObserver (stare przeglądarki) nic się nie zmienia.
 */
export function UstepujFormularzom() {
  const sciezka = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    if (typeof IntersectionObserver === 'undefined') return;
    const stan = new Map<Element, boolean>();
    const io = new IntersectionObserver((wpisy) => {
      for (const w of wpisy) stan.set(w.target, w.isIntersecting);
      html.toggleAttribute(ATRYBUT_FORMULARZA, formularzWidoczny(stan));
    });
    document.querySelectorAll('main form').forEach((f) => io.observe(f));
    return () => {
      io.disconnect();
      html.removeAttribute(ATRYBUT_FORMULARZA);
    };
  }, [sciezka]);

  return null;
}

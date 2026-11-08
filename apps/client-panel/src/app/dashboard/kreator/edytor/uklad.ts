'use client';

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { trzymajFokusWOknie } from '@/components/panel/fokus-okna';

/**
 * Układ edytora zależnie od szerokości okna (paczka 121). Wygląd ustawiają klasy CSS (bez mignięcia przy
 * ładowaniu); ten stan służy tylko zachowaniu – co ma się stać po kliknięciu sekcji, czy panel jest szufladą.
 * - szeroki ≥ 1440: trzy kolumny (struktura | podgląd | edycja);
 * - sredni 1024–1439: struktura w szufladzie z lewej („Sekcje”), podgląd + edycja;
 * - waski 768–1023: podgląd na całą szerokość, struktura i edycja w szufladach;
 * - telefon < 768: jeden panel naraz, zakładki na dole ekranu.
 */
export type UkladEdytora = 'szeroki' | 'sredni' | 'waski' | 'telefon';

export const ZAPYTANIA_UKLADU = {
  telefon: '(max-width: 767.98px)',
  waski: '(max-width: 1023.98px)',
  sredni: '(max-width: 1439.98px)',
} as const;

export function ukladDlaSzerokosci(szerokosc: number): UkladEdytora {
  if (szerokosc < 768) return 'telefon';
  if (szerokosc < 1024) return 'waski';
  if (szerokosc < 1440) return 'sredni';
  return 'szeroki';
}

function odczytaj(): UkladEdytora {
  if (typeof window === 'undefined' || !window.matchMedia) return 'szeroki';
  if (window.matchMedia(ZAPYTANIA_UKLADU.telefon).matches) return 'telefon';
  if (window.matchMedia(ZAPYTANIA_UKLADU.waski).matches) return 'waski';
  if (window.matchMedia(ZAPYTANIA_UKLADU.sredni).matches) return 'sredni';
  return 'szeroki';
}

function subskrybuj(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const listy = Object.values(ZAPYTANIA_UKLADU).map((q) => window.matchMedia(q));
  listy.forEach((m) => m.addEventListener('change', cb));
  return () => listy.forEach((m) => m.removeEventListener('change', cb));
}

/** Serwer i hydratacja: „szeroki” (klasy CSS i tak pokazują właściwy układ); zaraz potem wartość z przeglądarki. */
export function useUkladEdytora(): UkladEdytora {
  return useSyncExternalStore(subskrybuj, odczytaj, () => 'szeroki');
}

/**
 * Szuflada / okno na całym ekranie jako dialog (WCAG 2.1.2, 2.4.3): po otwarciu fokus na oknie, Tab nie wychodzi
 * na zasłoniętą stronę, Esc zamyka, po zamknięciu fokus wraca tam, skąd okno otwarto. Klawisze z okna zagnieżdżonego
 * (np. pytanie o nazwę podstrony nad szufladą) zostawiamy temu oknu.
 */
export function useOknoModalne(otwarte: boolean, zamknij: () => void, okno: RefObject<HTMLElement | null>) {
  const zamknijRef = useRef(zamknij);
  useEffect(() => {
    zamknijRef.current = zamknij;
  });
  useEffect(() => {
    if (!otwarte) return;
    const el = okno.current;
    const poprzedni = document.activeElement as HTMLElement | null;
    el?.focus();
    const klawisz = (e: KeyboardEvent) => {
      const aktywny = document.activeElement;
      if (el && aktywny && aktywny !== document.body && !el.contains(aktywny)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        zamknijRef.current();
      } else trzymajFokusWOknie(e, el);
    };
    window.addEventListener('keydown', klawisz);
    return () => {
      window.removeEventListener('keydown', klawisz);
      const aktywny = document.activeElement;
      if (!aktywny || aktywny === document.body || el?.contains(aktywny)) poprzedni?.focus?.();
    };
  }, [otwarte, okno]);
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { ATRYBUT_POMIN } from '@/lib/zrzut-strony';

/**
 * Beta „Zgłoś uwagę” — tryb wskazania miejsca na stronie. Ramka podąża za kursorem, kliknięcie (albo dotknięcie)
 * wybiera element i NIE uruchamia go (link nie przechodzi, przycisk nie zapisuje). Esc albo „Anuluj” — powrót do
 * formularza bez wyboru. Nasza belka i ramka mają ATRYBUT_POMIN: nie da się ich wskazać i nie ma ich na zrzucie.
 * A3-6 (WCAG 2.1.1, 2.4.3) — także z klawiatury: Tab przechodzi po elementach strony (ramka idzie za fokusem),
 * Enter albo spacja wybiera element z fokusem. Ukryte okno formularza nie przechwytuje już Tab.
 */
export function WskazywanieElementu({ onWybrano, onAnuluj }: { onWybrano: (el: Element) => void; onAnuluj: () => void }) {
  const [ramka, setRamka] = useState<DOMRect | null>(null);
  const wybrano = useRef(onWybrano);
  const anuluj = useRef(onAnuluj);
  useEffect(() => {
    wybrano.current = onWybrano;
    anuluj.current = onAnuluj;
  });

  useEffect(() => {
    const cel = (e: Event): Element | null => {
      const t = e.target;
      return t instanceof Element && !t.closest(`[${ATRYBUT_POMIN}]`) ? t : null;
    };
    const ruch = (e: Event) => {
      const t = cel(e);
      setRamka(t ? t.getBoundingClientRect() : null);
    };
    // Wciśnięcie na stronie nie może przenieść fokusu ani zacząć przeciągania.
    const blokuj = (e: Event) => {
      if (!cel(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const klik = (e: Event) => {
      const t = cel(e);
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      wybrano.current(t);
    };
    // Faza przechwytywania na oknie — przed obsługą klawiszy w oknie formularza (ono jest tylko ukryte, a jego
    // pułapka fokusu przestawiała każdy Tab na niewidoczny element).
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        anuluj.current();
        return;
      }
      if (e.key === 'Tab') {
        // Bez preventDefault — przeglądarka przenosi fokus po stronie; zatrzymujemy tylko pułapkę okna.
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const aktywny = document.activeElement;
        if (!(aktywny instanceof Element) || aktywny === document.body || aktywny.closest(`[${ATRYBUT_POMIN}]`)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        wybrano.current(aktywny);
      }
    };
    const fokus = (e: Event) => {
      const t = cel(e);
      setRamka(t ? t.getBoundingClientRect() : null);
    };
    const przewiniecie = () => setRamka(null);
    const opcje = { capture: true } as const;
    document.addEventListener('pointermove', ruch, opcje);
    document.addEventListener('pointerdown', blokuj, opcje);
    document.addEventListener('mousedown', blokuj, opcje);
    document.addEventListener('click', klik, opcje);
    window.addEventListener('keydown', klawisz, opcje);
    window.addEventListener('scroll', przewiniecie, opcje);
    document.addEventListener('focusin', fokus, opcje);
    return () => {
      document.removeEventListener('focusin', fokus, opcje);
      document.removeEventListener('pointermove', ruch, opcje);
      document.removeEventListener('pointerdown', blokuj, opcje);
      document.removeEventListener('mousedown', blokuj, opcje);
      document.removeEventListener('click', klik, opcje);
      window.removeEventListener('keydown', klawisz, opcje);
      window.removeEventListener('scroll', przewiniecie, opcje);
    };
  }, []);

  return (
    <div {...{ [ATRYBUT_POMIN]: '' }}>
      <style>{'*{cursor:crosshair!important}'}</style>
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[80] flex flex-wrap items-center justify-center gap-3 border-b border-line-strong bg-card/95 px-4 py-2.5 text-sm text-foreground shadow-lg backdrop-blur"
      >
        <span>Kliknij miejsce na stronie, którego dotyczy uwaga – albo przejdź do niego klawiszem Tab i naciśnij Enter.</span>
        <button
          type="button"
          onClick={() => anuluj.current()}
          className="rounded-md border border-line px-3 py-1 text-xs hover:bg-raised"
        >
          Anuluj (Esc)
        </button>
      </div>
      {ramka ? (
        <div
          aria-hidden
          data-ramka-wskazania
          className="pointer-events-none fixed z-[79] rounded-[3px] border-2 border-crit bg-crit/10 transition-all duration-75"
          style={{ left: ramka.left - 2, top: ramka.top - 2, width: ramka.width + 4, height: ramka.height + 4 }}
        />
      ) : null}
    </div>
  );
}

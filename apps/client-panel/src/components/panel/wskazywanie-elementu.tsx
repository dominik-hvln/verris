'use client';

import { useEffect, useRef, useState } from 'react';
import { ATRYBUT_POMIN } from '@/lib/zrzut-strony';

/**
 * Beta „Zgłoś uwagę” — tryb wskazania miejsca na stronie. Ramka podąża za kursorem, kliknięcie (albo dotknięcie)
 * wybiera element i NIE uruchamia go (link nie przechodzi, przycisk nie zapisuje). Esc albo „Anuluj” — powrót do
 * formularza bez wyboru. Nasza belka i ramka mają ATRYBUT_POMIN: nie da się ich wskazać i nie ma ich na zrzucie.
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
    // Faza przechwytywania na oknie — przed obsługą Esc w oknie formularza (ono jest tylko ukryte).
    const klawisz = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      anuluj.current();
    };
    const przewiniecie = () => setRamka(null);
    const opcje = { capture: true } as const;
    document.addEventListener('pointermove', ruch, opcje);
    document.addEventListener('pointerdown', blokuj, opcje);
    document.addEventListener('mousedown', blokuj, opcje);
    document.addEventListener('click', klik, opcje);
    window.addEventListener('keydown', klawisz, opcje);
    window.addEventListener('scroll', przewiniecie, opcje);
    return () => {
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
        <span>Kliknij miejsce na stronie, którego dotyczy uwaga.</span>
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

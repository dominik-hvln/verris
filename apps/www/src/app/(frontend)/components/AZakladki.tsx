'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/*
 * Grupa A (makieta 14.10) — zakładki: panel na stronie głównej, scenariusze miesiąca na /hosting.
 * Wszystkie panele są w HTML z serwera (nieaktywne mają `hidden`), więc treść nie czeka na JavaScript.
 * Strzałki ←/→, Home i End przełączają zakładki (wzorzec WAI-ARIA Tabs).
 */
export type Zakladka = { id: string; label: string; panel: ReactNode };

export function AZakladki({ label, items }: { label: string; items: Zakladka[] }) {
  const [akt, setAkt] = useState(0);
  const przyciski = useRef<(HTMLButtonElement | null)[]>([]);

  const idz = (i: number) => {
    const n = (i + items.length) % items.length;
    setAkt(n);
    przyciski.current[n]?.focus();
  };
  const klawisz = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') idz(i + 1);
    else if (e.key === 'ArrowLeft') idz(i - 1);
    else if (e.key === 'Home') idz(0);
    else if (e.key === 'End') idz(items.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="a-tabs">
      <div role="tablist" aria-label={label} className="a-tablist">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              przyciski.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={i === akt}
            aria-controls={`panel-${t.id}`}
            tabIndex={i === akt ? 0 : -1}
            className="a-pill"
            onClick={() => setAkt(i)}
            onKeyDown={(e) => klawisz(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={i !== akt}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}

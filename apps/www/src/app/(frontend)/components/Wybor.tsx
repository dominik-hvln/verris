'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Opcja = { value: string; label: string };

/**
 * Własna lista wyboru w stylu strony (zamiast systemowego `<select>`, który wygląda inaczej
 * w każdej przeglądarce). Wzorzec ARIA „select-only combobox”: przycisk + lista opcji,
 * pełna obsługa klawiatury (strzałki, Home/End, Enter/Spacja, Esc, pierwsza litera).
 * Wartość trafia do formularza przez ukryte pole `name`, więc FormData działa jak z `<select>`.
 */
export function Wybor({
  id,
  name,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  options: Opcja[];
  defaultValue?: string;
}) {
  const listaId = useId();
  const [wartosc, setWartosc] = useState(defaultValue ?? options[0]?.value ?? '');
  const [otwarte, setOtwarte] = useState(false);
  const [aktywna, setAktywna] = useState(0);
  const korzen = useRef<HTMLDivElement>(null);
  const przycisk = useRef<HTMLButtonElement>(null);

  const wybrana = options.find((o) => o.value === wartosc) ?? options[0];
  const indeksWybranej = Math.max(0, options.findIndex((o) => o.value === wartosc));

  useEffect(() => {
    if (!otwarte) return;
    const zamknij = (e: MouseEvent) => {
      if (!korzen.current?.contains(e.target as Node)) setOtwarte(false);
    };
    document.addEventListener('mousedown', zamknij);
    return () => document.removeEventListener('mousedown', zamknij);
  }, [otwarte]);

  const otworz = () => {
    setAktywna(indeksWybranej);
    setOtwarte(true);
  };

  const wybierz = (i: number) => {
    const o = options[i];
    if (o) setWartosc(o.value);
    setOtwarte(false);
    przycisk.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const ostatnia = options.length - 1;
    if (!otwarte) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        otworz();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setAktywna((a) => Math.min(ostatnia, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setAktywna((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        e.preventDefault();
        setAktywna(0);
        break;
      case 'End':
        e.preventDefault();
        setAktywna(ostatnia);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        wybierz(aktywna);
        break;
      case 'Escape':
        e.preventDefault();
        setOtwarte(false);
        break;
      case 'Tab':
        setOtwarte(false);
        break;
      default:
        if (e.key.length === 1) {
          const litera = e.key.toLowerCase();
          const i = options.findIndex((o, n) => n > aktywna && o.label.toLowerCase().startsWith(litera));
          const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(litera));
          if (j >= 0) setAktywna(j);
        }
    }
  };

  return (
    <div className="wybor" ref={korzen}>
      <input type="hidden" name={name} value={wartosc} />
      <button
        ref={przycisk}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={otwarte}
        aria-controls={listaId}
        aria-activedescendant={otwarte ? `${listaId}-${aktywna}` : undefined}
        className="wybor-pole"
        onClick={() => (otwarte ? setOtwarte(false) : otworz())}
        onKeyDown={onKeyDown}
      >
        <span>{wybrana?.label}</span>
        <svg className="wybor-strzalka" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {otwarte ? (
        <ul id={listaId} role="listbox" aria-labelledby={id} className="wybor-lista">
          {options.map((o, i) => (
            // Klawiatura obsługiwana na polu (aria-activedescendant) — opcje nie dostają fokusu.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={o.value}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={o.value === wartosc}
              className={`wybor-opcja${i === aktywna ? ' aktywna' : ''}`}
              onMouseEnter={() => setAktywna(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wybierz(i)}
            >
              {o.label}
              {o.value === wartosc ? (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

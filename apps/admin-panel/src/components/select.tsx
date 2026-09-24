'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Wygląd pola jak pozostałe inputy panelu (gdy wywołujący nie poda własnych klas). */
const DOMYSLNE_POLE = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white';

/**
 * Niesystemowy select — lista renderowana w DOM (nie natywne <option>), spójna z ciemnym motywem.
 * Port komponentu z panelu klienta: klawiatura (Up/Down/Home/End/Enter/Esc/typeahead), klik poza,
 * role=combobox/listbox/option, aria-activedescendant, `id` dla `<label htmlFor>`.
 *
 * Różnice względem natywnej listy zniwelowane celowo:
 * - `name` → ukryty input, więc działa w zwykłym <form>/FormData/server action;
 * - `defaultValue` bez `value` → tryb niekontrolowany (np. formularz w komponencie serwerowym);
 * - wartość spoza listy pokazuje (i wysyła) pierwszą aktywną opcję — tak robi przeglądarka/React;
 * - ponowny wybór bieżącej opcji nie woła `onChange` (natywny select też nie).
 * `className` stylizuje przycisk (pole), `wrapperClassName` — kontener (układ).
 */
export function Select({
  value: valueProp,
  defaultValue,
  onChange,
  options = [],
  className,
  wrapperClassName,
  disabled,
  placeholder = 'Wybierz…',
  'aria-label': ariaLabel,
  id,
  name,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  className?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  /** Id przycisku (combobox) — do powiązania z `<label htmlFor>`. */
  id?: string;
  /** Nazwa pola w formularzu — renderuje `<input type="hidden">`. */
  name?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const value = valueProp ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // podświetlony indeks
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ q: string; t: number }>({ q: '', t: 0 });
  const baseId = useId();

  const matchIndex = options.findIndex((o) => o.value === value);
  const selectedIndex = matchIndex >= 0 ? matchIndex : options.findIndex((o) => !o.disabled);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const effective = selected ? selected.value : value;

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex]);

  const choose = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      setOpen(false);
      if (opt.value === effective) return;
      if (valueProp === undefined) setInner(opt.value);
      onChange?.(opt.value);
    },
    [options, onChange, effective, valueProp],
  );

  // Klik poza komponentem zamyka listę.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Po otwarciu przewiń do podświetlonej pozycji.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      if (!options.length) return;
      setActive((prev) => {
        let next = prev;
        for (let i = 0; i < options.length; i++) {
          next = (next + dir + options.length) % options.length;
          if (!options[next]?.disabled) break;
        }
        return next;
      });
    },
    [options],
  );

  const edge = (fromEnd: boolean) => {
    const idx = fromEnd
      ? options.map((o) => !o.disabled).lastIndexOf(true)
      : options.findIndex((o) => !o.disabled);
    if (idx >= 0) setActive(idx);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        edge(false);
        break;
      case 'End':
        e.preventDefault();
        edge(true);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        // typeahead — skok do opcji zaczynającej się od wpisanego ciągu
        if (e.key.length === 1) {
          const now = Date.now();
          typeahead.current.q = now - typeahead.current.t > 800 ? e.key : typeahead.current.q + e.key;
          typeahead.current.t = now;
          const q = typeahead.current.q.toLowerCase();
          const idx = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  return (
    <div ref={rootRef} className={cx('relative', wrapperClassName)}>
      {name ? <input type="hidden" name={name} value={effective} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-listbox` : undefined}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cx(
          'flex items-center justify-between gap-2 text-left outline-none',
          'focus-visible:ring-2 focus-visible:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-emerald-400/20',
          className ?? cx('w-full', DOMYSLNE_POLE),
        )}
      >
        {/* Niewidoczne etykiety wszystkich opcji trzymają stałą szerokość pola, jak w natywnym selekcie. */}
        <span className="grid min-w-0">
          {options.map((o) => (
            <span key={o.value} aria-hidden className="invisible col-start-1 row-start-1 h-0 truncate">
              {o.label}
            </span>
          ))}
          <span className={cx('col-start-1 row-start-1 truncate', !selected && 'text-neutral-500')}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cx('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        // preventDefault: gdy Select siedzi w <label>, klik w listę nie może „kliknąć” przycisku ponownie.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- klawiaturę obsługuje combobox
        <ul
          ref={listRef}
          id={`${baseId}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onClick={(e) => e.preventDefault()}
          className={cx(
            'absolute left-0 top-full z-50 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-white/10',
            'bg-neutral-950 p-1 text-sm normal-case tracking-normal shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95 duration-100',
          )}
        >
          {options.map((o, idx) => {
            const isSel = idx === selectedIndex;
            const isActive = idx === active;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- klawiaturę obsługuje combobox (aria-activedescendant), opcje nie dostają fokusu
              <li
                key={o.value}
                id={`${baseId}-opt-${idx}`}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(idx)}
                className={cx(
                  'flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5',
                  o.disabled
                    ? 'cursor-not-allowed text-neutral-600'
                    : isActive
                      ? 'cursor-pointer bg-emerald-400/15 text-white'
                      : 'cursor-pointer text-neutral-200',
                )}
              >
                <span>{o.label}</span>
                {isSel ? <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <span className="w-3.5 shrink-0" />}
              </li>
            );
          })}
          {options.length === 0 ? <li className="px-2.5 py-1.5 text-neutral-500">Brak opcji</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

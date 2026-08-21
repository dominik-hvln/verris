'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Ładny (niesystemowy) select — w pełni customowa lista rozwijana renderowana w
 * DOM (nie natywne <option> przeglądarki), spójna z ciemnym motywem panelu.
 * Pełna obsługa klawiatury (Up/Down/Home/End/Enter/Esc/typeahead), klik poza,
 * a11y (role=listbox/option, aria-activedescendant). API zgodne z poprzednią
 * wersją: value + onChange(value) + options.
 */
export function Select({
  value,
  onChange,
  options = [],
  className,
  disabled,
  placeholder = 'Wybierz…',
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // podświetlony indeks
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ q: string; t: number }>({ q: '', t: 0 });
  const baseId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

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
      onChange(opt.value);
      setOpen(false);
    },
    [options, onChange],
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
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
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
          const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
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
          'flex w-full items-center justify-between gap-2 rounded-lg border bg-black/40 px-3 py-2 pr-3',
          'text-left text-sm outline-none transition-colors',
          'hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'border-emerald-400/60 ring-2 ring-emerald-400/20' : 'border-white/10',
        )}
      >
        <span className={cx('truncate', selected ? 'text-white' : 'text-neutral-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={`${baseId}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={cx(
            'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10',
            'bg-[#0e1512] p-1 shadow-2xl shadow-black/60 ring-1 ring-black/40',
            'animate-in fade-in-0 zoom-in-95 duration-100',
          )}
        >
          {options.map((o, idx) => {
            const isSel = o.value === value;
            const isActive = idx === active;
            return (
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
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm',
                  o.disabled
                    ? 'cursor-not-allowed text-neutral-600'
                    : isActive
                      ? 'bg-emerald-400/15 text-white'
                      : 'text-neutral-200',
                )}
              >
                <span className="truncate">{o.label}</span>
                {isSel ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : null}
              </li>
            );
          })}
          {options.length === 0 ? (
            <li className="px-2.5 py-1.5 text-sm text-neutral-500">Brak opcji</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

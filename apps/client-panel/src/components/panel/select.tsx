'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './cx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Ile pozycji przeskakuje PageUp/PageDown (jak w przykładzie APG). */
const SKOK_STRONY = 10;
/** Po tylu ms bez klawisza wyszukiwanie po literach zaczyna się od nowa. */
const PRZERWA_WYSZUKIWANIA = 500;

/**
 * Ładny (niesystemowy) select — lista rozwijana renderowana w DOM (nie natywne <option>
 * przeglądarki), spójna z ciemnym motywem panelu. API zgodne z poprzednią wersją:
 * value + onChange(value) + options.
 *
 * Dostępność wg wzorca WAI-ARIA APG „Select-Only Combobox”
 * (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/), P-12:
 * - pole to element z role="combobox" (nie <button> — VoiceOver w Safari czytał przycisk-combobox
 *   po jego treści, czyli placeholderze, zamiast po etykiecie; przejście 12.10);
 * - nazwa z widocznej etykiety: `aria-labelledby`, albo `<label htmlFor={id}>` — taka etykieta
 *   dostaje id i jest wskazana przez aria-labelledby pola i listy (div nie jest „labelable”, więc
 *   samo `for` nie wystarcza); `aria-label` tylko tam, gdzie widocznej etykiety nie ma;
 * - lista role="listbox" jest zawsze w DOM (ukryta, gdy zamknięta), więc aria-controls zawsze
 *   wskazuje istniejący element; przy otwartej liście aria-activedescendant wskazuje podświetloną
 *   opcję, a fokus DOM zostaje na polu (Esc nie musi go „przywracać”, bo go nie zabiera);
 * - klawiatura: Enter/Spacja/↓/↑/Alt+↓/Home/End otwierają; ↑/↓/Home/End/PageUp/PageDown
 *   przechodzą; Enter/Spacja/Alt+↑ wybierają i zamykają; Esc i Tab zamykają bez wyboru;
 *   wpisanie liter skacze do opcji (powtórzona litera — do następnej na tę literę).
 */
export function Select({
  value,
  onChange,
  options = [],
  className,
  disabled,
  placeholder = 'Wybierz…',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Nazwa pola, gdy obok nie ma widocznej etykiety. Gdy jest — użyj `aria-labelledby` albo `id` + `<label htmlFor>`. */
  'aria-label'?: string;
  /** Id widocznej etykiety (jednej lub kilku, rozdzielonych spacją). */
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  /** Id pola (combobox) — do powiązania z `<label htmlFor>`. */
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // podświetlony indeks
  const rootRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ q: string; t: number }>({ q: '', t: 0 });
  const baseId = useId();
  const comboId = id ?? `${baseId}-combobox`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (idx: number) => `${baseId}-opt-${idx}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const enabled = useCallback((idx: number) => Boolean(options[idx] && !options[idx].disabled), [options]);
  /** Najbliższa dostępna opcja od `start` w kierunku `dir` (bez zawijania, jak w APG). */
  const nearestEnabled = useCallback(
    (start: number, dir: 1 | -1) => {
      for (let i = start; i >= 0 && i < options.length; i += dir) if (enabled(i)) return i;
      return -1;
    },
    [options.length, enabled],
  );

  const openAt = useCallback(
    (idx?: number) => {
      if (disabled) return;
      const start = idx ?? (selectedIndex >= 0 ? selectedIndex : 0);
      const target = enabled(start) ? start : Math.max(nearestEnabled(start, 1), nearestEnabled(start, -1), 0);
      setActive(target);
      setOpen(true);
    },
    [disabled, selectedIndex, enabled, nearestEnabled],
  );

  const choose = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      comboRef.current?.focus();
    },
    [options, onChange],
  );

  // `<label htmlFor={id}>` nie nazywa elementu z role="combobox" (div nie jest „labelable”) —
  // wiążemy taką etykietę przez aria-labelledby (pole i lista) i oddajemy fokus po kliknięciu w nią,
  // jak przy natywnym polu. Jawne `aria-labelledby` ma pierwszeństwo.
  useEffect(() => {
    const combo = comboRef.current;
    const list = listRef.current;
    if (!combo || !list || !id || ariaLabelledBy) return;
    const label = [...document.querySelectorAll('label')].find((l) => l.htmlFor === id);
    if (!label) return;
    const nadaneId = !label.id;
    if (nadaneId) label.id = `${id}-etykieta`;
    combo.setAttribute('aria-labelledby', label.id);
    list.setAttribute('aria-labelledby', label.id);
    const onLabelClick = (e: MouseEvent) => {
      if (combo.contains(e.target as Node)) return;
      e.preventDefault();
      if (combo.getAttribute('aria-disabled') !== 'true') combo.focus();
    };
    label.addEventListener('click', onLabelClick);
    return () => {
      label.removeEventListener('click', onLabelClick);
      combo.removeAttribute('aria-labelledby');
      list.removeAttribute('aria-labelledby');
      if (nadaneId) label.removeAttribute('id');
    };
  }, [id, ariaLabelledBy]);

  // Klik poza komponentem zamyka listę.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Przewiń do podświetlonej pozycji.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  /** Wyszukiwanie po literach; zwraca indeks trafienia albo -1. */
  const search = (key: string, from: number) => {
    const now = Date.now();
    const prev = typeahead.current;
    const q = now - prev.t > PRZERWA_WYSZUKIWANIA ? key : prev.q + key;
    typeahead.current = { q, t: now };
    const needle = q.toLowerCase();
    // Ta sama litera kilka razy z rzędu — przechodzimy po kolejnych opcjach na tę literę.
    const powtorzona = needle.length > 1 && [...needle].every((c) => c === needle[0]);
    const szukane = powtorzona ? needle[0]! : needle;
    const start = powtorzona || needle.length === 1 ? from + 1 : from;
    for (let i = 0; i < options.length; i++) {
      const idx = (start + i) % options.length;
      if (enabled(idx) && options[idx]!.label.toLowerCase().startsWith(szukane)) return idx;
    }
    return -1;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const { key, altKey, ctrlKey, metaKey } = e;
    const last = options.length - 1;
    const znak = key.length === 1 && key !== ' ' && !ctrlKey && !metaKey && !altKey;
    const wyszukiwanieTrwa = Date.now() - typeahead.current.t <= PRZERWA_WYSZUKIWANIA && typeahead.current.q !== '';

    if (!open) {
      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case ' ':
          e.preventDefault();
          openAt();
          return;
        case 'Home':
          e.preventDefault();
          openAt(nearestEnabled(0, 1));
          return;
        case 'End':
          e.preventDefault();
          openAt(nearestEnabled(last, -1));
          return;
        default:
          if (znak) {
            e.preventDefault();
            const idx = search(key, selectedIndex >= 0 ? selectedIndex : -1);
            openAt(idx >= 0 ? idx : undefined);
          }
          return;
      }
    }

    switch (key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = nearestEnabled(active + 1, 1);
        if (next >= 0) setActive(next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (altKey) {
          choose(active);
          break;
        }
        const prev = nearestEnabled(active - 1, -1);
        if (prev >= 0) setActive(prev);
        break;
      }
      case 'Home':
        e.preventDefault();
        setActive(Math.max(nearestEnabled(0, 1), 0));
        break;
      case 'End':
        e.preventDefault();
        setActive(Math.max(nearestEnabled(last, -1), 0));
        break;
      case 'PageDown': {
        e.preventDefault();
        const t = nearestEnabled(Math.min(active + SKOK_STRONY, last), -1);
        if (t >= 0) setActive(t);
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        const t = nearestEnabled(Math.max(active - SKOK_STRONY, 0), 1);
        if (t >= 0) setActive(t);
        break;
      }
      case ' ':
        e.preventDefault();
        // Spacja w trakcie wpisywania nazwy to część szukanego tekstu, nie wybór.
        if (wyszukiwanieTrwa) {
          const idx = search(key, active - 1);
          if (idx >= 0) setActive(idx);
        } else choose(active);
        break;
      case 'Enter':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        comboRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (znak) {
          e.preventDefault();
          const idx = search(key, active);
          if (idx >= 0) setActive(idx);
        }
    }
  };

  const activeExists = open && active >= 0 && active < options.length;

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <div
        ref={comboRef}
        id={comboId}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeExists ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired || undefined}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openAt();
        }}
        onKeyDown={onKeyDown}
        className={cx(
          'flex w-full cursor-default select-none items-center justify-between gap-2 rounded-lg border bg-black/40 px-3 py-2 pr-3',
          'text-left text-sm outline-none transition-colors',
          'hover:border-white/20 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          open ? 'border-emerald-400/60 ring-2 ring-emerald-400/20' : 'border-white/10',
        )}
      >
        <span className={cx('min-w-0 break-words', selected ? 'text-white' : 'text-neutral-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cx('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </div>

      {/* Lista zawsze w DOM (aria-controls musi wskazywać istniejący element), ukryta, gdy zamknięta.
          mousedown bez domyślnej akcji — klik w opcję nie zabiera fokusu polu. */}
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        hidden={!open}
        onMouseDown={(e) => e.preventDefault()}
        className={cx(
          'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/10',
          'bg-card p-1 shadow-2xl shadow-black/40',
          'animate-in fade-in-0 zoom-in-95 duration-100',
        )}
      >
        {options.map((o, idx) => {
          const isSel = o.value === value;
          const isActive = open && idx === active;
          return (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- klawiaturę obsługuje combobox (aria-activedescendant), opcje nie dostają fokusu
            <li
              key={o.value}
              id={optionId(idx)}
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
              <span className="min-w-0 break-words">{o.label}</span>
              {isSel ? <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : null}
            </li>
          );
        })}
        {options.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled className="px-2.5 py-1.5 text-sm text-neutral-500">
            Brak opcji
          </li>
        ) : null}
      </ul>
    </div>
  );
}

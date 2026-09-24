'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from './select';
import {
  DNI_TYGODNIA,
  MIESIACE,
  type Dzien,
  doWyswietlenia,
  dzis,
  przesun,
  przesunMiesiac,
  rozbierz,
  siatkaMiesiaca,
  taSamaData,
  zloz,
} from '@/lib/kalendarz';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const DOMYSLNE_POLE = 'rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white';
const dwa = (n: number) => String(n).padStart(2, '0');
const GODZINY = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: dwa(h) }));

/**
 * Niesystemowe pole daty (i godziny) — zamiennik `<input type="date|datetime-local">`, spójny z `Select`.
 * Wartość ma DOKŁADNIE format natywnego pola („2026-09-24” / „2026-09-24T14:30”), więc wywołujący
 * i API nie zmieniają parsowania. `name` → ukryty input (zwykły <form> / server action),
 * `defaultValue` bez `value` → tryb niekontrolowany, `required` sprawdza przeglądarka przy wysyłce.
 * Klawiatura w siatce: strzałki, PageUp/PageDown (miesiąc), Home/End (tydzień), Enter, Esc.
 */
export function PoleDaty({
  value: valueProp,
  defaultValue,
  onChange,
  zGodzina = false,
  name,
  id,
  required,
  className,
  wrapperClassName,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  zGodzina?: boolean;
  name?: string;
  id?: string;
  required?: boolean;
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const value = valueProp ?? inner;
  const wybrana = rozbierz(value);
  const [open, setOpen] = useState(false);
  const [fokus, setFokus] = useState<Dzien>(wybrana?.dzien ?? dzis());
  const [godzina, setGodzina] = useState(wybrana?.godzina ?? 12);
  const [minuta, setMinuta] = useState(wybrana?.minuta ?? 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const przyciskRef = useRef<HTMLButtonElement>(null);
  const siatkaRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const ustaw = (v: string) => {
    if (valueProp === undefined) setInner(v);
    onChange?.(v);
  };

  const otworz = () => {
    const r = rozbierz(value);
    setFokus(r?.dzien ?? dzis());
    setGodzina(r?.godzina ?? 12);
    setMinuta(r?.minuta ?? 0);
    setOpen(true);
  };

  const zamknij = (przywrocFokus = true) => {
    setOpen(false);
    if (przywrocFokus) przyciskRef.current?.focus();
  };

  const wybierz = (d: Dzien) => {
    setFokus(d);
    if (zGodzina) {
      ustaw(zloz(d, godzina, minuta));
    } else {
      ustaw(zloz(d));
      zamknij();
    }
  };

  // Klik poza komponentem zamyka kalendarz.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Esc zamyka kalendarz. Lista godzin (Select) obsługuje Esc sama i oznacza zdarzenie jako obsłużone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) zamknij();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Fokus podąża za aktywnym dniem (roving tabindex).
  useEffect(() => {
    if (!open) return;
    siatkaRef.current?.querySelector<HTMLButtonElement>('[data-fokus="true"]')?.focus();
  }, [open, fokus]);

  const onSiatkaKey = (e: React.KeyboardEvent) => {
    const ruch: Record<string, () => Dzien> = {
      ArrowLeft: () => przesun(fokus, -1),
      ArrowRight: () => przesun(fokus, 1),
      ArrowUp: () => przesun(fokus, -7),
      ArrowDown: () => przesun(fokus, 7),
      PageUp: () => przesunMiesiac(fokus, -1),
      PageDown: () => przesunMiesiac(fokus, 1),
      Home: () => przesun(fokus, -((new Date(Date.UTC(fokus.rok, fokus.miesiac, fokus.dzien)).getUTCDay() + 6) % 7)),
      End: () => przesun(fokus, 6 - ((new Date(Date.UTC(fokus.rok, fokus.miesiac, fokus.dzien)).getUTCDay() + 6) % 7)),
    };
    const f = ruch[e.key];
    if (f) {
      e.preventDefault();
      setFokus(f());
    }
  };

  const minuty = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minuty.includes(minuta)) minuty.push(minuta);
  minuty.sort((a, b) => a - b);

  const zmienCzas = (h: number, m: number) => {
    setGodzina(h);
    setMinuta(m);
    const d = rozbierz(value)?.dzien;
    if (d) ustaw(zloz(d, h, m));
  };

  const tekst = doWyswietlenia(value, zGodzina);
  const siatka = siatkaMiesiaca(fokus.rok, fokus.miesiac);
  const teraz = dzis();

  return (
    <div ref={rootRef} className={cx('relative', wrapperClassName)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {required ? (
        // Pole-cień dla walidacji formularza: przeglądarka pokaże „wypełnij to pole” przy przycisku.
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          onFocus={() => przyciskRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      ) : null}
      <button
        ref={przyciskRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-kalendarz` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? zamknij(false) : otworz())}
        className={cx(
          'flex items-center justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30',
          open && 'ring-2 ring-emerald-400/20',
          className ?? cx('w-full', DOMYSLNE_POLE),
        )}
      >
        <span className={cx('truncate', !tekst && 'text-neutral-500')}>
          {tekst || placeholder || (zGodzina ? 'Wybierz datę i godzinę' : 'Wybierz datę')}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
      </button>

      {open ? (
        <div
          id={`${baseId}-kalendarz`}
          role="dialog"
          aria-label={zGodzina ? 'Wybór daty i godziny' : 'Wybór daty'}
          className="absolute left-0 z-50 mt-1 w-72 rounded-xl border border-white/10 bg-[#0a0a0a] p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Poprzedni miesiąc" onClick={() => setFokus(przesunMiesiac(fokus, -1))} className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-white" aria-live="polite">
              {MIESIACE[fokus.miesiac]} {fokus.rok}
            </span>
            <button type="button" aria-label="Następny miesiąc" onClick={() => setFokus(przesunMiesiac(fokus, 1))} className="rounded-md p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-neutral-500" aria-hidden>
            {DNI_TYGODNIA.map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div ref={siatkaRef} role="grid" aria-label={`${MIESIACE[fokus.miesiac]} ${fokus.rok}`} className="grid grid-cols-7 gap-0.5">
            {siatka.map((d) => {
              const obcy = d.miesiac !== fokus.miesiac;
              const zaznaczony = taSamaData(d, wybrana?.dzien);
              const aktywny = taSamaData(d, fokus);
              return (
                <button
                  key={`${d.rok}-${d.miesiac}-${d.dzien}`}
                  type="button"
                  role="gridcell"
                  tabIndex={aktywny ? 0 : -1}
                  data-fokus={aktywny}
                  aria-selected={zaznaczony}
                  aria-label={`${d.dzien} ${MIESIACE[d.miesiac]} ${d.rok}`}
                  onClick={() => wybierz(d)}
                  onKeyDown={onSiatkaKey}
                  className={cx(
                    'h-8 rounded-md text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40',
                    zaznaczony ? 'bg-emerald-500/20 font-semibold text-emerald-200' : 'hover:bg-white/5',
                    !zaznaczony && (obcy ? 'text-neutral-600' : 'text-neutral-200'),
                    taSamaData(d, teraz) && !zaznaczony && 'ring-1 ring-inset ring-white/15',
                  )}
                >
                  {d.dzien}
                </button>
              );
            })}
          </div>

          {zGodzina ? (
            <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-neutral-400">
              <span>Godzina</span>
              <Select aria-label="Godzina" value={String(godzina)} onChange={(v) => zmienCzas(+v, minuta)} options={GODZINY} wrapperClassName="w-20" />
              <span aria-hidden>:</span>
              <Select aria-label="Minuta" value={String(minuta)} onChange={(v) => zmienCzas(godzina, +v)} options={minuty.map((m) => ({ value: String(m), label: dwa(m) }))} wrapperClassName="w-20" />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <button type="button" onClick={() => { ustaw(''); zamknij(); }} className="rounded-md px-2 py-1 text-neutral-400 hover:bg-white/5 hover:text-white">
              Wyczyść
            </button>
            <div className="flex gap-1">
              <button type="button" onClick={() => wybierz(teraz)} className="rounded-md px-2 py-1 text-neutral-300 hover:bg-white/5 hover:text-white">
                Dzisiaj
              </button>
              {zGodzina ? (
                <button type="button" onClick={() => zamknij()} className="rounded-md bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-200 hover:bg-emerald-500/30">
                  Gotowe
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

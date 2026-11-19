'use client';

import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { cx } from '@/components/panel/cx';
import { kolorBarwy, nazwaBarwy, normalizujBarwe, PRESETY_BARW } from '@/lib/kreator-marki';
import { klasaPrzyciskuDrugiego } from '../kreator/klasy';

/**
 * Paczka 131 – wybór barwy (OKLCH h, 0–359) bez systemowego pola koloru: pasek odcieni jako suwak (APG „Slider”:
 * strzałki ±5°, PageUp/PageDown ±30°, Home/End; przeciąganie wskaźnikiem), próbka i nazwa barwy po polsku.
 * Kolory pasa liczone w OKLCH (ta sama jasność i nasycenie co próbka), więc widać realną barwę marki.
 */
const PAS = Array.from({ length: 13 }, (_, i) => kolorBarwy(i * 30)).join(', ');

export function PasekBarw({ barwa, onZmiana, etykieta, className }: { barwa: number; onZmiana: (h: number) => void; etykieta: string; className?: string }) {
  const pas = useRef<HTMLDivElement | null>(null);
  const z = (h: number) => onZmiana(normalizujBarwe(h));
  const zPozycji = (clientX: number) => {
    const r = pas.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    z(Math.min(359, Math.max(0, ((clientX - r.left) / r.width) * 360)));
  };
  const klawisz = (e: KeyboardEvent) => {
    const krok = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 30, PageDown: -30 }[e.key];
    if (krok !== undefined) {
      e.preventDefault();
      z(barwa + krok);
    } else if (e.key === 'Home') {
      e.preventDefault();
      z(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      z(359);
    }
  };
  const start = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zPozycji(e.clientX);
  };
  return (
    <div
      ref={pas}
      role="slider"
      tabIndex={0}
      aria-label={etykieta}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={barwa}
      aria-valuetext={`${nazwaBarwy(barwa)}, ${barwa}°`}
      onKeyDown={klawisz}
      onPointerDown={start}
      onPointerMove={(e) => {
        if (e.buttons === 1) zPozycji(e.clientX);
      }}
      className={cx('relative h-8 w-full cursor-pointer touch-none rounded-[7px] border border-line-strong outline-none focus-visible:ring-2 focus-visible:ring-data/60 max-md:h-11', className)}
      style={{ background: `linear-gradient(to right, ${PAS})` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-[calc(100%+6px)] w-3 -translate-x-1/2 -translate-y-1/2 rounded-[4px] border-2 border-foreground shadow"
        style={{ left: `${(barwa / 360) * 100}%`, background: kolorBarwy(barwa) }}
      />
    </div>
  );
}

/**
 * Barwy lubiane / odrzucone w briefie (do 3): szybkie próbki (jak w makiecie) albo dowolna barwa z paska.
 * Wybrane – jako chipy z przyciskiem usunięcia.
 */
export function ListaBarw({
  etykieta,
  wybrane,
  onZmiana,
  zablokowane = [],
  max = 3,
  barwaPaska,
  onBarwaPaska,
}: {
  etykieta: string;
  wybrane: number[];
  onZmiana: (b: number[]) => void;
  /** Barwy wybrane po drugiej stronie (lubiane ↔ odrzucone) – nie da się ich dodać. */
  zablokowane?: number[];
  max?: number;
  barwaPaska: number;
  onBarwaPaska: (h: number) => void;
}) {
  const id = useId();
  const pelna = wybrane.length >= max;
  const blisko = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < 12;
  const dodaj = (h: number) => {
    const b = normalizujBarwe(h);
    if (pelna || wybrane.some((x) => blisko(x, b)) || zablokowane.some((x) => blisko(x, b))) return;
    onZmiana([...wybrane, b]);
  };
  const zajeta = (h: number) => wybrane.some((x) => blisko(x, h)) || zablokowane.some((x) => blisko(x, h));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 flex w-full items-baseline justify-between gap-2 p-0 text-[13px] font-medium text-foreground">
        <span>{etykieta}</span>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {wybrane.length}/{max}
        </span>
      </legend>
      <div className="flex flex-wrap gap-1.5" aria-label={`${etykieta} – szybki wybór`} role="group">
        {PRESETY_BARW.map((p) => {
          const wybrany = wybrane.some((x) => blisko(x, p.barwa));
          return (
            <button
              key={p.nazwa}
              type="button"
              aria-pressed={wybrany}
              disabled={!wybrany && (pelna || zablokowane.some((x) => blisko(x, p.barwa)))}
              onClick={() => (wybrany ? onZmiana(wybrane.filter((x) => !blisko(x, p.barwa))) : dodaj(p.barwa))}
              className={cx(
                'flex min-w-[64px] flex-col items-center gap-1 rounded-[8px] border px-1.5 py-1.5 text-[11.5px] text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-11',
                wybrany ? 'border-data bg-data-soft' : 'border-line bg-card hover:border-line-strong',
              )}
            >
              <span aria-hidden className="h-5 w-5 rounded-full border border-line" style={{ background: kolorBarwy(p.barwa) }} />
              {p.nazwa}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-pasek`} className="text-[12px] text-muted-foreground">
          Albo dowolna barwa:
        </span>
        <div className="flex items-center gap-2">
          <PasekBarw barwa={barwaPaska} onZmiana={onBarwaPaska} etykieta={`${etykieta} – barwa do dodania`} className="min-w-0 flex-1" />
          <button type="button" onClick={() => dodaj(barwaPaska)} disabled={pelna || zajeta(barwaPaska)} className={cx(klasaPrzyciskuDrugiego, 'flex-none px-2.5')}>
            <Plus className="h-4 w-4" aria-hidden /> Dodaj<span className="sr-only"> {nazwaBarwy(barwaPaska)}</span>
          </button>
        </div>
      </div>
      {wybrane.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`${etykieta} – wybrane`}>
          {wybrane.map((h) => (
            <li key={h} className="flex items-center gap-1.5 rounded-full border border-line bg-raised py-0.5 pl-1 pr-0.5 text-[12px] text-foreground">
              <span aria-hidden className="h-4 w-4 rounded-full" style={{ background: kolorBarwy(h) }} />
              {nazwaBarwy(h)} <span className="font-mono text-[11px] text-muted-foreground">{h}°</span>
              <button
                type="button"
                onClick={() => onZmiana(wybrane.filter((x) => x !== h))}
                aria-label={`Usuń barwę ${nazwaBarwy(h)} ${h}°`}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground max-md:h-9 max-md:w-9"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

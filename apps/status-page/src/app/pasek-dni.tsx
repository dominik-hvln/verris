'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { DayDto } from '@/lib/api';
import { dzienKrotko, plForm } from '@/lib/format';
import { klasaDnia, nastepnyIndeks, OPIS_KLASY, trescDymka } from '@/lib/widok';

/** Odstęp dymka od krawędzi ekranu (px) — przy skrajnych słupkach dymek przesuwa się, strzałka zostaje nad słupkiem. */
const MARGINES = 8;
/** Na telefonie widać tyle ostatnich dni (starsze słupki mają klasę .old, CSS je chowa). */
export const DNI_NA_TELEFONIE = 30;

const slupki = (g: HTMLElement | null) => [...(g?.querySelectorAll<HTMLButtonElement>('.sv-dzien') ?? [])];

/**
 * Pasek dni jednej usługi z dymkiem dnia (najechanie, dotknięcie, klawiatura). Jedyny kliencki fragment strony.
 * Dostępność: cała grupa to jeden przystanek Tab (roving tabindex), ←/→ i Home/End chodzą po dniach,
 * dymek (role="tooltip") jest opisem aktywnego słupka przez aria-describedby. Escape i dotknięcie poza zamykają.
 */
export function PasekDni({
  nazwa,
  dni,
  pierwszyPomiar,
  zdarzenia,
}: {
  nazwa: string;
  /** Pełne okno z API (90 dni), rosnąco — ostatni to dziś. */
  dni: DayDto[];
  /** Indeks pierwszego dnia z pomiarami tej usługi; wcześniejsze dni to „przed uruchomieniem pomiarów”. */
  pierwszyPomiar: number;
  /** Opisy zdarzeń per dzień ('YYYY-MM-DD'). */
  zdarzenia: Record<string, string[]>;
}) {
  const id = useId();
  const dymekId = `${id}-dymek`;
  const grupa = useRef<HTMLDivElement>(null);
  const dymek = useRef<HTMLDivElement>(null);
  const [aktywny, setAktywny] = useState(dni.length - 1);
  const [otwarty, setOtwarty] = useState<number | null>(null);
  const przeniescFokus = useRef(false);

  const otworz = (i: number) => {
    setAktywny(i);
    setOtwarty(i);
  };

  // Fokus przenosimy po renderze — czytnik dostaje nowy słupek razem z już podmienioną treścią dymka.
  useEffect(() => {
    if (!przeniescFokus.current) return;
    przeniescFokus.current = false;
    slupki(grupa.current)[aktywny]?.focus();
  }, [aktywny]);

  // Pozycja dymka: nad środkiem słupka, przesunięta tak, żeby nie wychodziła poza ekran; bez miejsca u góry — pod słupkiem.
  useLayoutEffect(() => {
    const g = grupa.current;
    const el = dymek.current;
    const s = otwarty !== null ? slupki(grupa.current)[otwarty] : undefined;
    if (!g || !el || !s) return;
    const rg = g.getBoundingClientRect();
    const rs = s.getBoundingClientRect();
    const szer = el.offsetWidth;
    const ekran = document.documentElement.clientWidth || window.innerWidth;
    const srodek = rs.left + rs.width / 2;
    const lewo = Math.max(MARGINES, Math.min(srodek - szer / 2, ekran - MARGINES - szer));
    el.style.left = `${lewo - rg.left}px`;
    el.style.setProperty('--strzalka', `${srodek - lewo}px`);
    if (rs.top - el.offsetHeight - 12 < 0) el.dataset.pod = '';
    else delete el.dataset.pod;
  }, [otwarty]);

  // Dotknięcie / kliknięcie poza paskiem, Escape (także gdy dymek otworzyła mysz) i zmiana rozmiaru zamykają dymek.
  useEffect(() => {
    if (otwarty === null) return;
    const poza = (e: PointerEvent) => {
      if (!grupa.current?.contains(e.target as Node)) setOtwarty(null);
    };
    const klawisz = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOtwarty(null);
    };
    const zamknij = () => setOtwarty(null);
    document.addEventListener('pointerdown', poza);
    document.addEventListener('keydown', klawisz);
    window.addEventListener('resize', zamknij);
    return () => {
      document.removeEventListener('pointerdown', poza);
      document.removeEventListener('keydown', klawisz);
      window.removeEventListener('resize', zamknij);
    };
  }, [otwarty]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      setOtwarty(null);
      return;
    }
    // Na telefonie starsze dni są schowane (display: none) — Home i ← zatrzymują się na pierwszym widocznym.
    const lista = slupki(grupa.current);
    const min = Math.max(0, lista.findIndex((b) => getComputedStyle(b).display !== 'none'));
    const n = nastepnyIndeks(e.key, aktywny, dni.length, min);
    if (n === null) return;
    e.preventDefault();
    przeniescFokus.current = true;
    otworz(n);
  }

  const pokazany = otwarty !== null ? dni[otwarty] : undefined;
  const tresc = pokazany && otwarty !== null ? trescDymka(pokazany, otwarty < pierwszyPomiar) : null;
  const zdarzeniaDnia = pokazany ? (zdarzenia[pokazany.date] ?? []) : [];

  return (
    <div
      ref={grupa}
      className="sv-pasek"
      role="group"
      aria-label={`${nazwa} — stan dzień po dniu, ostatnie ${dni.length} ${plForm(dni.length, 'dzień', 'dni', 'dni')}`}
      data-otwarty={otwarty !== null ? '' : undefined}
      onKeyDown={onKeyDown}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setOtwarty(null);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOtwarty(null);
      }}
    >
      {dni.map((d, i) => {
        const przed = i < pierwszyPomiar;
        const k = przed ? 'przed' : klasaDnia(d);
        return (
          <button
            key={d.date}
            type="button"
            className={i < dni.length - DNI_NA_TELEFONIE ? 'sv-dzien old' : 'sv-dzien'}
            data-k={k}
            data-otwarty={otwarty === i ? '' : undefined}
            tabIndex={i === aktywny ? 0 : -1}
            aria-label={`${dzienKrotko(d.date)}: ${OPIS_KLASY[k]}`}
            aria-describedby={otwarty === i ? dymekId : undefined}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') otworz(i);
            }}
            onFocus={() => otworz(i)}
            onClick={() => otworz(i)}
          />
        );
      })}
      <div ref={dymek} id={dymekId} role="tooltip" className="sv-dymek" hidden={!tresc}>
        {tresc ? (
          <>
            <strong>{tresc.data}</strong>
            <span className="sv-dymek-stan">
              <i data-k={tresc.klasa} aria-hidden="true" />
              {tresc.stan}
            </span>
            {tresc.szczegoly.map((t) => (
              <span key={t} className="sv-dymek-liczby">
                {t}
              </span>
            ))}
            {zdarzeniaDnia.length ? (
              <ul>
                {zdarzeniaDnia.map((z, j) => (
                  <li key={j}>{z}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

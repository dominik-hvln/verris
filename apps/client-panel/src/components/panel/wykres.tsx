'use client';

/**
 * Wykres liniowy (historia + przerywana prognoza + linia limitu) albo słupkowy — inline SVG, bez zależności.
 * Dymek z wartością i czasem punktu pod kursorem oraz z klawiatury (fokus, strzałki ←/→, Home/End),
 * a dla czytnika ekranu ten sam tekst w aria-valuetext suwaka (WCAG 2.1.1, 1.4.13).
 * Kolory z tokenów panelu (--data, --data-soft, --warn, --crit, --line) — działa w obu motywach.
 */

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cx } from './cx';

export interface PunktWykresu {
  v: number;
  /** Opis punktu w dymku, np. „pon., 5 paź, 14:00”. */
  label: string;
  /** Czas (ms) — położenie na osi X w wariancie liniowym; bez niego punkty są rozłożone równo. */
  t?: number;
}

type Aktywny = PunktWykresu & { prognoza: boolean };

/** Punkt najbliższy pozycji kursora (0–1 szerokości). Czysta funkcja — testowana przez komponent. */
function najblizszy(xs: number[], ratio: number): number {
  let best = 0;
  xs.forEach((x, i) => {
    if (Math.abs(x - ratio) < Math.abs(xs[best]! - ratio)) best = i;
  });
  return best;
}

export function Wykres({
  punkty,
  prognoza = [],
  limit,
  max,
  domena,
  format,
  nazwa,
  wariant = 'linia',
  wysokosc = 150,
  className,
}: {
  punkty: PunktWykresu[];
  /** Odcinek przerywany; pierwszy punkt to zwykle „teraz”. */
  prognoza?: PunktWykresu[];
  /** Linia limitu planu (ta sama jednostka co `v`); słupki ≥ 80% limitu są w kolorze ostrzeżenia. */
  limit?: number | null;
  max?: number;
  /** Zakres osi X w ms (np. −7 dni … +7 dni); domyślnie od pierwszego do ostatniego punktu. */
  domena?: [number, number];
  format: (v: number) => string;
  nazwa: string;
  wariant?: 'linia' | 'slupki';
  wysokosc?: number;
  className?: string;
}) {
  const [aktywny, setAktywny] = useState<number | null>(null);
  const wszystkie: Aktywny[] = [
    ...punkty.map((p) => ({ ...p, prognoza: false })),
    // Pierwszy punkt prognozy pokrywa się z ostatnim pomiarem — w dymku byłby dwa razy.
    ...prognoza.slice(punkty.length ? 1 : 0).map((p) => ({ ...p, prognoza: true })),
  ];
  const n = wszystkie.length;
  const czasy = [...punkty, ...prognoza].map((p) => p.t).filter((t): t is number => t != null);
  const [d0, d1] = domena ?? [Math.min(...czasy), Math.max(...czasy)];
  const slupki = wariant === 'slupki';
  // Pozycja X w ułamku szerokości: słupek — środek swojej szczeliny; linia — czas albo indeks.
  const x = (p: PunktWykresu, i: number) =>
    slupki ? (i + 0.5) / n : p.t != null && d1 > d0 ? (p.t - d0) / (d1 - d0) : n > 1 ? i / (n - 1) : 0.5;
  const xs = wszystkie.map(x);
  const top = max ?? Math.max(limit ?? 0, ...wszystkie.map((p) => p.v), 1);
  const y = (v: number) => 100 - (Math.max(0, Math.min(v, top)) / top) * 94; // 6% oddechu nad limitem
  const pkt = (ps: PunktWykresu[], off: number) => ps.map((p, i) => `${(x(p, i + off) * 100).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');

  const a = aktywny != null ? wszystkie[aktywny] : undefined;
  const opisPunktu = (i: number) => {
    const p = wszystkie[i];
    return p ? `${p.label}: ${format(p.v)}${p.prognoza ? ' (prognoza)' : ''}` : '';
  };

  const onKey = (e: KeyboardEvent) => {
    const nast = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (nast == null && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (e.key === 'Home') return setAktywny(0);
    if (e.key === 'End') return setAktywny(n - 1);
    setAktywny((i) => Math.max(0, Math.min(n - 1, (i ?? n - 1) + nast!)));
  };
  const onMove = (e: PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAktywny(najblizszy(xs, r.width ? (e.clientX - r.left) / r.width : 0));
  };

  if (n === 0) return null;
  return (
    <div className={cx('relative', className)}>
      <div
        // Suwak, nie obraz: fokusowalny obraz odrzuca axe (focus-order-semantics), a przy suwaku czytnik
        // sam przechodzi w tryb fokusu i czyta aria-valuetext po każdej strzałce.
        tabIndex={0}
        role="slider"
        aria-label={`${nazwa}. Strzałki w lewo i w prawo pokazują kolejne punkty.`}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={aktywny ?? n - 1}
        aria-valuetext={opisPunktu(aktywny ?? n - 1)}
        onFocus={() => setAktywny((i) => i ?? n - 1)}
        onBlur={() => setAktywny(null)}
        onKeyDown={onKey}
        onPointerMove={onMove}
        onPointerLeave={() => setAktywny(null)}
        className="cursor-crosshair"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: wysokosc }} aria-hidden>
          <line x1="0" x2="100" y1="100" y2="100" stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
          {limit != null && limit > 0 && limit <= top ? (
            <line x1="0" x2="100" y1={y(limit)} y2={y(limit)} stroke="var(--crit)" strokeDasharray="4 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
          ) : null}
          {slupki ? (
            wszystkie.map((p, i) => {
              const w = 100 / n;
              return (
                <rect
                  key={i}
                  x={i * w + w * 0.12}
                  width={w * 0.76}
                  y={y(p.v)}
                  height={Math.max(1.5, 100 - y(p.v))}
                  fill={i === aktywny ? 'var(--data-hi)' : limit && p.v >= limit * 0.8 ? 'var(--warn)' : i === n - 1 ? 'var(--data)' : 'var(--data-2)'}
                />
              );
            })
          ) : (
            <>
              {prognoza.length ? (
                <line x1={xs[Math.max(0, punkty.length - 1)]! * 100} x2={xs[Math.max(0, punkty.length - 1)]! * 100} y1="0" y2="100" stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
              ) : null}
              {punkty.length > 1 ? (
                <polygon points={`${x(punkty[0]!, 0) * 100},100 ${pkt(punkty, 0)} ${x(punkty.at(-1)!, punkty.length - 1) * 100},100`} fill="var(--data-soft)" />
              ) : null}
              <polyline points={pkt(punkty, 0)} fill="none" stroke="var(--data)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {prognoza.length > 1 ? (
                <polyline points={pkt(prognoza, Math.max(0, punkty.length - 1))} fill="none" stroke="var(--data)" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
              ) : null}
              {aktywny != null ? (
                <line x1={xs[aktywny]! * 100} x2={xs[aktywny]! * 100} y1="0" y2="100" stroke="var(--data-hi)" vectorEffect="non-scaling-stroke" />
              ) : null}
            </>
          )}
        </svg>
      </div>
      {a ? (
        <>
          {slupki ? null : (
            <span
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-data-hi"
              style={{ left: `${xs[aktywny!]! * 100}%`, top: (y(a.v) / 100) * wysokosc }}
            />
          )}
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-[220px] rounded-[5px] bg-foreground px-2.5 py-1.5 font-mono text-xs leading-snug text-background"
            // Dymek nie wychodzi poza kartę: przy brzegach przyklejony do krawędzi.
            style={{ left: `${Math.min(100, Math.max(0, xs[aktywny!]! * 100))}%`, transform: `translateX(-${Math.round(Math.min(1, Math.max(0, xs[aktywny!]!)) * 100)}%)` }}
          >
            <span className="block font-sans text-[12.5px]">{format(a.v)}</span>
            {a.label}
            {a.prognoza ? ' · prognoza' : ''}
          </div>
        </>
      ) : null}
    </div>
  );
}

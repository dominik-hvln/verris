"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

export interface Punkt {
  t: string;
  v: number;
}
export type TonWykresu = "data" | "data-2" | "warn" | "crit";

const W = 160;

/** Indeks punktu najbliższego pozycji `x` (współrzędne viewBox). Czysta funkcja — testowana. */
export function najblizszy(xs: number[], x: number): number {
  let best = 0;
  xs.forEach((p, i) => {
    if (Math.abs(p - x) < Math.abs(xs[best]! - x)) best = i;
  });
  return best;
}

const godzina = (t: string, zDniem: boolean) =>
  new Date(t).toLocaleString("pl-PL", {
    ...(zDniem ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });

/**
 * Wykres liniowy / obszarowy z dymkiem (wartość + godzina punktu pod kursorem). Inline SVG, kolory z tokenów,
 * więc działa w jasnym i ciemnym motywie. Klawiatura: Tab na wykres, strzałki / Home / End po punktach.
 * Oś X to czas (`od`–`do`), więc luki w telemetrii widać jako luki, a wykresy węzłów są wyrównane.
 */
export function Wykres({
  punkty,
  od,
  do: doT,
  etykieta,
  jednostka = "%",
  ton = "data",
  wysokosc = 48,
  obszar = true,
  max = 100,
}: {
  punkty: Punkt[];
  od: string;
  do: string;
  etykieta: string;
  jednostka?: string;
  ton?: TonWykresu;
  wysokosc?: number;
  obszar?: boolean;
  max?: number;
}) {
  const [aktywny, setAktywny] = useState<number | null>(null);
  if (!punkty.length) {
    return (
      <div className="flex items-center text-xs text-muted-foreground" style={{ height: wysokosc }}>
        brak próbek
      </div>
    );
  }
  const H = wysokosc;
  const t0 = Date.parse(od);
  const dt = Math.max(1, Date.parse(doT) - t0);
  const zDniem = dt > 2 * 86_400_000;
  const xs = punkty.map((p) => Math.min(W, Math.max(0, ((Date.parse(p.t) - t0) / dt) * W)));
  const ys = punkty.map((p) => H - 2 - (Math.min(max, Math.max(0, p.v)) / max) * (H - 4));
  const linia = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(" ");
  const kolor = `var(--${ton})`;
  const tekst = (i: number) => `${punkty[i]!.v.toLocaleString("pl-PL")}${jednostka} · ${godzina(punkty[i]!.t, zDniem)}`;
  const ost = punkty.length - 1;

  const ruch = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAktywny(najblizszy(xs, ((e.clientX - r.left) / (r.width || 1)) * W));
  };
  const klawisz = (e: KeyboardEvent<SVGSVGElement>) => {
    const i = aktywny ?? ost;
    const nowy = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: ost }[e.key];
    if (nowy == null) return;
    e.preventDefault();
    setAktywny(Math.min(ost, Math.max(0, nowy)));
  };

  return (
    <div className="relative" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-full w-full cursor-crosshair overflow-visible rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-data"
        // Suwak po punktach: czytnik ekranu ogłasza wartość i godzinę przy każdej zmianie strzałką.
        role="slider"
        tabIndex={0}
        aria-label={etykieta}
        aria-valuemin={0}
        aria-valuemax={ost}
        aria-valuenow={aktywny ?? ost}
        aria-valuetext={tekst(aktywny ?? ost)}
        onPointerMove={ruch}
        onPointerLeave={() => setAktywny(null)}
        onFocus={() => setAktywny(ost)}
        onBlur={() => setAktywny(null)}
        onKeyDown={klawisz}
      >
        {obszar ? <polygon points={`${xs[0]!.toFixed(1)},${H} ${linia} ${xs[ost]!.toFixed(1)},${H}`} style={{ fill: `color-mix(in srgb, ${kolor} 15%, transparent)` }} /> : null}
        <polyline points={linia} fill="none" style={{ stroke: kolor }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {aktywny != null ? (
          <line x1={xs[aktywny]} x2={xs[aktywny]} y1={0} y2={H} style={{ stroke: "var(--line-strong)" }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {aktywny != null ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{ left: `${(xs[aktywny]! / W) * 100}%`, top: `${(ys[aktywny]! / H) * 100}%`, background: kolor }}
          />
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-20 mb-1.5 w-max -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-foreground px-2 py-1 font-mono text-xs text-background"
            style={{ left: `clamp(64px, ${(xs[aktywny]! / W) * 100}%, calc(100% - 64px))` }}
          >
            {tekst(aktywny)}
          </span>
        </>
      ) : null}
    </div>
  );
}

'use client';

import { useState } from 'react';

type Licznik = 'verris' | 'moje';
type Motyw = 'ciemny' | 'jasny';

/**
 * Odznaka na stronę: „Verris — X posadzonych drzew” (W6, decyzja 12). Klient wybiera licznik: wszystkie drzewa
 * Verris albo swoje (własne + udział w drzewach zbiorczych). Liczą się tylko drzewa z certyfikatem partnera; dopóki
 * licznik jest zerowy, obrazek pokazuje sam znak Verris.
 */
export function EcoOdznakaDrzew({ badgeSrc }: { badgeSrc: string }) {
  const [licznik, setLicznik] = useState<Licznik>('verris');
  const [motyw, setMotyw] = useState<Motyw>('ciemny');
  const src = `${badgeSrc}?motyw=${motyw}&wariant=eko&licznik=${licznik}`;
  const html = `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${src}" height="44" alt="Verris – posadzone drzewa"></a>`;

  const seg = <T extends string>(label: string, value: T, set: (v: T) => void, opcje: [T, string][]) => (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
      {opcje.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => set(v)}
          className={`rounded-lg px-3 py-1.5 text-sm ${value === v ? 'bg-emerald-600 text-white' : 'text-neutral-300 hover:text-white'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {seg('Licznik na odznace', licznik, setLicznik, [
          ['verris', 'Wszystkie drzewa Verris'],
          ['moje', 'Moje drzewa'],
        ])}
        {seg('Motyw', motyw, setMotyw, [
          ['ciemny', 'Ciemny'],
          ['jasny', 'Jasny'],
        ])}
      </div>
      <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-white/10 bg-black/50 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Podgląd odznaki" height={44} className="max-w-full" />
      </div>
      <label className="block space-y-1 text-xs text-neutral-500">
        HTML
        <textarea
          readOnly
          className="min-h-[72px] w-full rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-xs text-neutral-300"
          value={html}
        />
      </label>
    </div>
  );
}

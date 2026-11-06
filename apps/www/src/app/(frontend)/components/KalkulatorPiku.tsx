'use client';

import { useState, type CSSProperties } from 'react';
import { formatZl, kosztPiku } from '@/lib/kalkulator';
import { CENY_ZAPASOWE, netto, nettoStawki, stawka, type StawkiAutoskalowania } from '@/lib/ceny';

// Kalkulator dopłaty za pik (/hosting#kalkulator): vCPU i RAM ponad bazę × czas trwania; stawki z propsa (API),
// bez propsa — wartości zapasowe z lib/ceny.ts.

const SUWAKI = [
  { id: 'kp-vcpu', label: 'Dodatkowe vCPU ponad bazę', min: 0, max: 22, start: 7 },
  { id: 'kp-ram', label: 'Dodatkowy RAM ponad bazę (GB)', min: 0, max: 56, start: 4 },
  { id: 'kp-h', label: 'Czas trwania piku (godziny)', min: 1, max: 72, start: 3 },
] as const;

const fill = (v: number, min: number, max: number) =>
  ({ ['--fill']: `${((v - min) / (max - min)) * 100}%` }) as CSSProperties;

export function KalkulatorPiku({ stawki = CENY_ZAPASOWE.stawki }: { stawki?: StawkiAutoskalowania }) {
  const [w, setW] = useState<number[]>(SUWAKI.map((s) => s.start));
  const [vcpu, ram, h] = w;
  const doplata = kosztPiku(vcpu, ram, h, stawki);

  return (
    <div className="card kalk">
      {SUWAKI.map((s, i) => (
        <div className="kalk-row" key={s.id}>
          <div className="kalk-lbl">
            <label htmlFor={s.id}>{s.label}</label>
            <output htmlFor={s.id}>{w[i]}</output>
          </div>
          <input
            id={s.id}
            type="range"
            min={s.min}
            max={s.max}
            step={1}
            value={w[i]}
            style={fill(w[i], s.min, s.max)}
            onChange={(e) => setW(w.map((x, j) => (j === i ? Number(e.target.value) : x)))}
          />
        </div>
      ))}
      <div className="kalk-out" aria-live="polite">
        <span>Dopłata za ten pik (brutto; {formatZl(netto(doplata))} zł netto)</span>
        <strong>{formatZl(doplata)} zł</strong>
      </div>
      <p className="kalk-note">
        Brutto (netto): 1 vCPU·h = {stawka(stawki.cpu * 100)} zł ({stawka(nettoStawki(stawki.cpu * 100))} zł) · 1 GB
        RAM·h = {stawka(stawki.ram)} zł ({stawka(nettoStawki(stawki.ram))} zł) · naliczanie w blokach 15 min
      </p>
    </div>
  );
}

'use client';

import { useState, type CSSProperties } from 'react';
import { STAWKI, formatZl } from '@/lib/kalkulator';

/*
 * Grupa A — kalkulator dopłat za moc ponad pakiet (strona główna i /cennik). Stawki wyłącznie z lib/kalkulator.ts.
 *  - wariant „krotki” (strona główna): pamięć ponad pakiet × godziny piku w miesiącu;
 *  - wariant „pelny” (/cennik): procesor, pamięć, dysk, godziny i przełącznik pakietu miesięczny/roczny.
 * Bez JavaScriptu kalkulator pokazuje wynik dla wartości startowych (render na serwerze).
 */

type Suwak = { id: string; label: string; min: number; max: number; step: number; start: number; jedn: (v: number) => string };

const CPU: Suwak = {
  id: 'ak-cpu',
  label: 'Procesor ponad pakiet',
  min: 0,
  max: 2200,
  step: 50,
  start: 400,
  jedn: (v) => `${v}% · ${String(v / 100).replace('.', ',')} vCPU`,
};
const RAM = (start: number): Suwak => ({
  id: 'ak-ram',
  label: 'Pamięć RAM ponad pakiet',
  min: 0,
  max: 56,
  step: 1,
  start,
  jedn: (v) => `${v} GB`,
});
const DYSK: Suwak = { id: 'ak-dysk', label: 'Dysk ponad pakiet', min: 0, max: 950, step: 10, start: 0, jedn: (v) => `${v} GB` };
const GODZ = (max: number, step: number, start: number): Suwak => ({
  id: 'ak-godz',
  label: 'Godziny ze szczytem w miesiącu',
  min: 0,
  max,
  step,
  start,
  jedn: (v) => `${v} h`,
});

const fill = (v: number, s: Suwak) => ({ ['--fill']: `${((v - s.min) / (s.max - s.min)) * 100}%` }) as CSSProperties;

/** Koszt godziny z dodatkową mocą (brutto): % CPU, GB RAM, GB dysku. */
export function kosztGodziny(cpuProc: number, ramGb: number, dyskGb: number): number {
  return cpuProc * STAWKI.cpu + ramGb * STAWKI.ram + dyskGb * STAWKI.dysk;
}

export function AKalkulator({ wariant }: { wariant: 'krotki' | 'pelny' }) {
  const suwaki: Suwak[] = wariant === 'pelny' ? [CPU, RAM(16), DYSK, GODZ(720, 4, 36)] : [RAM(8), GODZ(200, 5, 40)];
  const [w, setW] = useState<number[]>(suwaki.map((s) => s.start));
  const [rocznie, setRocznie] = useState(true);
  const wart = (id: string) => {
    const i = suwaki.findIndex((s) => s.id === id);
    return i < 0 ? 0 : w[i];
  };

  const godzina = kosztGodziny(wart('ak-cpu'), wart('ak-ram'), wart('ak-dysk'));
  const doplata = godzina * wart('ak-godz');
  const baza = wariant === 'pelny' && rocznie ? 449 / 12 : 45;

  return (
    <div className={`a-kalk a-kalk-${wariant}`}>
      <div className="card kalk">
        {suwaki.map((s, i) => (
          <div className="kalk-row" key={s.id}>
            <div className="kalk-lbl">
              <label htmlFor={s.id}>{s.label}</label>
              <output htmlFor={s.id}>{s.jedn(w[i])}</output>
            </div>
            <input
              id={s.id}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={w[i]}
              style={fill(w[i], s)}
              onChange={(e) => setW(w.map((x, j) => (j === i ? Number(e.target.value) : x)))}
            />
          </div>
        ))}
        <p className="kalk-note">
          Stawki brutto za godzinę: 1% procesora (100% = 1 vCPU) — {String(STAWKI.cpu).replace('.', ',')} zł · 1 GB
          RAM — {String(STAWKI.ram).replace('.', ',')} zł · 1 GB dysku — {String(STAWKI.dysk).replace('.', ',')} zł.
          Naliczanie w blokach po 15 minut.
        </p>
      </div>

      <div className="card card-accent a-kalk-wynik" aria-live="polite">
        {wariant === 'pelny' && (
          <div className="seg" role="group" aria-label="Pakiet w wyliczeniu">
            <button type="button" aria-pressed={rocznie} onClick={() => setRocznie(true)}>
              Rocznie
            </button>
            <button type="button" aria-pressed={!rocznie} onClick={() => setRocznie(false)}>
              Miesięcznie
            </button>
          </div>
        )}
        <dl>
          {wariant === 'pelny' && (
            <div>
              <dt>Godzina z taką mocą</dt>
              <dd>{formatZl(godzina)} zł</dd>
            </div>
          )}
          <div>
            <dt>Dopłata w tym miesiącu</dt>
            <dd className="mint">{formatZl(doplata)} zł</dd>
          </div>
          <div className="a-kalk-suma">
            <dt>Razem z pakietem{wariant === 'pelny' && rocznie ? ' (449 zł/rok ÷ 12)' : ' (45 zł/mies)'}</dt>
            <dd>{formatZl(baza + doplata)} zł</dd>
          </div>
          {wariant === 'pelny' && (
            <div>
              <dt>Gdyby szczyt trwał cały miesiąc (720 h)</dt>
              <dd>{formatZl(godzina * 720)} zł</dd>
            </div>
          )}
        </dl>
        <p className="kalk-note">
          W panelu ustawiasz miesięczny limit kosztu autoskalowania. Gdy dopłaty go osiągną, zasoby wracają do pakietu,
          a Ty dostajesz powiadomienie.
        </p>
      </div>
    </div>
  );
}

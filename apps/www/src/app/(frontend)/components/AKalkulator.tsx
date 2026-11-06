'use client';

import { useState, type CSSProperties } from 'react';
import { formatZl, PRZYKLAD_BLACK_FRIDAY } from '@/lib/kalkulator';
import {
  CENY_ZAPASOWE,
  GODZIN_W_MIESIACU,
  kwotaGodzinowa,
  netto,
  nettoStawki,
  stawka,
  zl,
  type Ceny,
  type StawkiAutoskalowania,
} from '@/lib/ceny';

/*
 * Grupa A — kalkulator dopłat za moc ponad pakiet (strona główna i /cennik). Ceny i stawki z propsa `ceny`
 * (strona pobiera je z API przez lib/ceny-api.ts); bez propsa — wartości zapasowe z lib/ceny.ts.
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
  start: PRZYKLAD_BLACK_FRIDAY.vcpu * 100,
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

/**
 * Koszt godziny z dodatkową mocą (brutto): % CPU, GB RAM, GB dysku. Na pełnych stawkach z API — bez zaokrąglania;
 * do grosza zaokrąglamy dopiero kwoty do zapłaty (dopłata w miesiącu, razem z pakietem).
 */
export function kosztGodziny(cpuProc: number, ramGb: number, dyskGb: number, s: StawkiAutoskalowania = CENY_ZAPASOWE.stawki): number {
  return cpuProc * s.cpu + ramGb * s.ram + dyskGb * s.dysk;
}

export function AKalkulator({ wariant, ceny = CENY_ZAPASOWE }: { wariant: 'krotki' | 'pelny'; ceny?: Ceny }) {
  const STAWKI = ceny.stawki;
  const h = ceny.hosting;
  // P2-09: wariant pełny startuje od przykładu Black Friday (ten sam co na /hosting i /hosting/sklep); miesiąc = 730 h jak w panelu.
  const suwaki: Suwak[] =
    wariant === 'pelny'
      ? [CPU, RAM(PRZYKLAD_BLACK_FRIDAY.ramGb), DYSK, GODZ(GODZIN_W_MIESIACU, 1, PRZYKLAD_BLACK_FRIDAY.godziny)]
      : [RAM(8), GODZ(200, 5, 40)];
  const [w, setW] = useState<number[]>(suwaki.map((s) => s.start));
  const [rocznie, setRocznie] = useState(true);
  const wart = (id: string) => {
    const i = suwaki.findIndex((s) => s.id === id);
    return i < 0 ? 0 : w[i];
  };

  const godzina = kosztGodziny(wart('ak-cpu'), wart('ak-ram'), wart('ak-dysk'), STAWKI);
  const doplata = godzina * wart('ak-godz');
  const baza = wariant === 'pelny' && rocznie ? h.rocznie / 12 : h.miesiecznie;

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
          Stawki za godzinę, brutto (netto): 1% procesora (100% = 1 vCPU) — {stawka(STAWKI.cpu)} zł (
          {stawka(nettoStawki(STAWKI.cpu))} zł) · 1 GB RAM — {stawka(STAWKI.ram)} zł ({stawka(nettoStawki(STAWKI.ram))}{' '}
          zł) · 1 GB dysku — {stawka(STAWKI.dysk)} zł ({stawka(nettoStawki(STAWKI.dysk))} zł). Naliczanie w blokach po 15
          minut.
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
              <dd>
                {kwotaGodzinowa(godzina)} zł <small>brutto ({kwotaGodzinowa(nettoStawki(godzina))} zł netto)</small>
              </dd>
            </div>
          )}
          <div>
            <dt>Dopłata w tym miesiącu</dt>
            <dd className="mint">
              {formatZl(doplata)} zł <small>brutto ({formatZl(netto(doplata))} zł netto)</small>
            </dd>
          </div>
          <div className="a-kalk-suma">
            <dt>Razem z pakietem{wariant === 'pelny' && rocznie ? ` (${zl(h.rocznie)}/rok ÷ 12)` : ` (${zl(h.miesiecznie)}/mies)`}</dt>
            <dd>
              {formatZl(baza + doplata)} zł <small>brutto ({formatZl(netto(baza + doplata))} zł netto)</small>
            </dd>
          </div>
          {wariant === 'pelny' && (
            <div>
              <dt>Gdyby szczyt trwał cały miesiąc ({GODZIN_W_MIESIACU} h)</dt>
              <dd>
                {formatZl(godzina * GODZIN_W_MIESIACU)} zł{' '}
                <small>brutto ({formatZl(netto(godzina * GODZIN_W_MIESIACU))} zł netto)</small>
              </dd>
            </div>
          )}
        </dl>
        <p className="kalk-note">
          Bez limitu płacisz za faktyczne użycie. Limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni) ustawisz przy
          zamówieniu albo w panelu: gdy dopłaty go osiągną, zasoby wracają do pakietu, a Ty dostajesz powiadomienie.
        </p>
      </div>
    </div>
  );
}

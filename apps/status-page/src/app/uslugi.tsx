'use client';

import { useState } from 'react';
import type { DayDto, DayState, PublicServiceDto, ServiceState } from '@/lib/api';
import { dzienKrotko, pct, plForm } from '@/lib/format';

/**
 * Lista usług z paskiem dni. Przełącznik 30/90 dni działa tylko na telefonie (atrybut data-range
 * + CSS); od 768 px pasek zawsze pokazuje 90 dni. Wszystkie 90 słupków jest w HTML-u, więc
 * pierwszy render (SSR) i hydratacja są identyczne.
 */
const NOTATKI: Record<string, string> = {
  strony: 'strony na hostingu Verris',
  poczta: 'serwery poczty',
  bazy: 'bazy MySQL',
  dns: 'serwery nazw',
};

const STAN_USLUGI: Record<ServiceState, string> = { OK: 'Działa', DEGRADED: 'Spowolnienie', DOWN: 'Awaria' };
const STAN_DNIA: Record<DayState, string> = {
  OK: 'działa',
  DEGRADED: 'spowolnienie',
  DOWN: 'awaria',
  NO_DATA: 'brak danych',
};

function opisDnia(d: DayDto): string {
  const wynik = `${dzienKrotko(d.date)}: ${STAN_DNIA[d.state]}`;
  const ms = d.avgLatencyMs !== null ? `, śr. ${d.avgLatencyMs} ms` : '';
  return d.uptimePct !== null ? `${wynik}, dostępność ${pct(d.uptimePct)}${ms}` : wynik;
}

function podsumowanie(dni: DayDto[]): string {
  const awarie = dni.filter((d) => d.state === 'DOWN').length;
  const wolne = dni.filter((d) => d.state === 'DEGRADED').length;
  const brak = dni.filter((d) => d.state === 'NO_DATA').length;
  const czesci = [
    awarie ? `${awarie} ${plForm(awarie, 'dzień', 'dni', 'dni')} awarii` : null,
    wolne ? `${wolne} ${plForm(wolne, 'dzień', 'dni', 'dni')} spowolnienia` : null,
    brak ? `${brak} ${plForm(brak, 'dzień', 'dni', 'dni')} bez danych` : null,
  ].filter(Boolean);
  return czesci.length ? czesci.join(', ') : 'bez zakłóceń';
}

export function Uslugi({ services }: { services: PublicServiceDto[] }) {
  const [range, setRange] = useState<30 | 90>(30);
  return (
    <section className="st-uslugi" data-range={range} aria-labelledby="uslugi-h">
      <div className="st-services-head">
        <h2 id="uslugi-h" className="st-h2">
          Usługi
        </h2>
        <div className="st-toggle" role="group" aria-label="Zakres paska dni">
          {([30, 90] as const).map((n) => (
            <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}>
              {n} dni
            </button>
          ))}
        </div>
      </div>

      <div className="st-card" style={{ marginTop: 12 }}>
        <ul className="st-services" style={{ marginTop: 0 }}>
          {services.map((s) => (
            <li key={s.key} className="st-svc">
              <div className="st-svc-head">
                <div className="st-svc-name">
                  <span className="st-dot" data-state={s.state} aria-hidden="true" />
                  <strong>{s.name}</strong>
                  <span className="st-chip" data-state={s.state}>
                    {STAN_USLUGI[s.state]}
                  </span>
                  <span className="st-svc-note">{NOTATKI[s.key]}</span>
                </div>
                <div className="st-svc-metrics st-mono">
                  {s.avgLatencyMs !== null ? <span className="st-ms">{s.avgLatencyMs} ms</span> : null}
                  <span>
                    <span className="st-sr">Dostępność z 90 dni: </span>
                    {pct(s.uptime90Pct)}
                  </span>
                </div>
              </div>
              <div className="st-bars" role="group" aria-label={`${s.name} — stan dzień po dniu`}>
                {s.days.map((d, i) => (
                  <span
                    key={d.date}
                    role="img"
                    className={i < s.days.length - 30 ? 'st-bar old' : 'st-bar'}
                    data-state={d.state}
                    title={opisDnia(d)}
                    aria-label={opisDnia(d)}
                  />
                ))}
              </div>
              <div className="st-axis st-mono">
                <span>
                  <span className="st-r30">30 dni temu</span>
                  <span className="st-r90">90 dni temu</span> → dziś
                </span>
                <span className="st-sum">
                  <span className="st-r30">{podsumowanie(s.days.slice(-30))}</span>
                  <span className="st-r90">{podsumowanie(s.days)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="st-legend" aria-label="Legenda kolorów">
          <span>
            <i className="st-swatch" data-state="OK" />
            działa
          </span>
          <span>
            <i className="st-swatch" data-state="DEGRADED" />
            spowolnienie
          </span>
          <span>
            <i className="st-swatch" data-state="DOWN" />
            awaria
          </span>
          <span>
            <i className="st-swatch" data-state="NO_DATA" />
            brak danych
          </span>
        </div>
      </div>
    </section>
  );
}

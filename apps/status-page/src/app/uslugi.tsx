import type { DayDto, PublicServiceDto, ServiceState } from '@/lib/api';
import { dzienKrotko, pct, plForm } from '@/lib/format';
import { klasaDnia, type KlasaDnia } from '@/lib/widok';

/**
 * Lista usług: jeden wiersz na usługę (nazwa, pasek dni, czas odpowiedzi, dostępność).
 * Pasek zaczyna się od pierwszego dnia z pomiarami — dni sprzed uruchomienia sond nie wiszą jako szare pola.
 * Na telefonie przy długim zakresie widać ostatnie 30 dni (CSS ukrywa starsze słupki z klasą .old).
 */
const NOTATKI: Record<string, string> = {
  panel: 'logowanie i zarządzanie usługami',
  www: 'strona, cennik i zamówienia',
  api: 'interfejs programistyczny',
  strony: 'strony na hostingu Verris',
  poczta: 'serwery poczty',
  bazy: 'bazy MySQL',
  dns: 'serwery nazw',
};

const STAN_USLUGI: Record<ServiceState, string> = { OK: 'działa', DEGRADED: 'spowolnienie', DOWN: 'awaria' };
const OPIS_KLASY: Record<KlasaDnia, string> = {
  ok: 'działa',
  krotkie: 'krótkie zakłócenie',
  spowolnienie: 'spowolnienie',
  awaria: 'awaria',
  prace: 'planowane prace',
  brak: 'brak pomiarów',
};

function opisDnia(d: DayDto): string {
  const wynik = `${dzienKrotko(d.date)}: ${OPIS_KLASY[klasaDnia(d)]}`;
  const czas = d.avgLatencyMs !== null ? `, śr. ${d.avgLatencyMs} ms` : '';
  return d.uptimePct !== null ? `${wynik}, dostępność ${pct(d.uptimePct)}${czas}` : wynik;
}

export function Uslugi({ services, od }: { services: PublicServiceDto[]; od: number }) {
  const dni = services[0]?.days.slice(od) ?? [];
  const pelne = od === 0;
  return (
    <section className="sv-uslugi" aria-labelledby="uslugi-h">
      <div className="sv-sek-glowka">
        <h2 id="uslugi-h" className="sv-h">
          Usługi
        </h2>
        <span className="st-mono sv-meta">
          {pelne
            ? 'ostatnie 90 dni'
            : `pomiary od ${dzienKrotko(dni[0]?.date ?? '')} · ${dni.length} ${plForm(dni.length, 'dzień', 'dni', 'dni')}`}
        </span>
      </div>

      <ul className="sv-lista">
        {services.map((s) => {
          const dniUslugi = s.days.slice(od);
          return (
            <li key={s.key} className="sv-wiersz">
              <div className="sv-nazwa">
                <strong>
                  <span className="sv-kropka" data-state={s.state} aria-hidden="true" />
                  {s.name}
                  {s.state !== 'OK' ? (
                    <span className="sv-chip" data-state={s.state}>
                      {STAN_USLUGI[s.state]}
                    </span>
                  ) : (
                    <span className="st-sr">: {STAN_USLUGI[s.state]}</span>
                  )}
                </strong>
                <span>{NOTATKI[s.key]}</span>
              </div>
              <div className="sv-pasek" role="group" aria-label={`${s.name} — stan dzień po dniu`}>
                {dniUslugi.map((d, i) => (
                  <i
                    key={d.date}
                    role="img"
                    className={i < dniUslugi.length - 30 ? 'old' : undefined}
                    data-k={klasaDnia(d)}
                    title={opisDnia(d)}
                    aria-label={opisDnia(d)}
                  />
                ))}
              </div>
              <span className="sv-ms st-mono">{s.avgLatencyMs !== null ? `${s.avgLatencyMs} ms` : '—'}</span>
              <span className="sv-proc">
                <span className="st-sr">Dostępność: </span>
                {pct(s.uptime90Pct)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="sv-wiersz sv-os-wiersz" aria-hidden="true">
        <span />
        <div className="sv-os st-mono">
          {dni.length > 30 ? (
            <span>
              <span className="sv-tylko-tel">30 dni temu</span>
              <span className="sv-tylko-komp">{dzienKrotko(dni[0].date)}</span>
            </span>
          ) : (
            <span>{dzienKrotko(dni[0]?.date ?? '')}</span>
          )}
          <span>dziś</span>
        </div>
      </div>

      <div className="sv-legenda" aria-label="Legenda kolorów">
        {(['ok', 'krotkie', 'spowolnienie', 'awaria', 'prace'] as const).map((k) => (
          <span key={k}>
            <i data-k={k} />
            {k === 'krotkie' ? 'krótkie zakłócenie (do 5 min)' : OPIS_KLASY[k]}
          </span>
        ))}
      </div>
    </section>
  );
}

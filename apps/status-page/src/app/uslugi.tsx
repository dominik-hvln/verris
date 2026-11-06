import type { PublicIncidentDto, PublicMaintenanceDto, PublicServiceDto, ServiceState } from '@/lib/api';
import { dzienKrotko, pct, plForm } from '@/lib/format';
import { OPIS_KLASY, pierwszyPomiar, poczatekPomiarow, zdarzeniaDni } from '@/lib/widok';
import { DNI_NA_TELEFONIE, PasekDni } from './pasek-dni';

/**
 * Lista usług: jeden wiersz na usługę (nazwa, pasek dni, czas odpowiedzi, dostępność).
 * Pasek zawsze pokazuje pełne okno z API (90 dni, standard stron statusu). Dni sprzed pierwszego pomiaru usługi
 * mają osobny wygląd („przed uruchomieniem pomiarów”) — inny niż dzień bez pomiarów w trakcie działania sond.
 * Na telefonie widać ostatnie 30 dni (CSS ukrywa starsze słupki z klasą .old). Pasek z dymkiem to komponent
 * kliencki (`PasekDni`), reszta listy renderuje się na serwerze.
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

const ileDni = (n: number) => `${n} ${plForm(n, 'dzień', 'dni', 'dni')}`;

export function Uslugi({
  services,
  zdarzenia,
  prace,
  teraz,
}: {
  services: PublicServiceDto[];
  /** Incydenty z listy na stronie (trwające + ostatnie) — opisują dni w dymku paska. */
  zdarzenia: PublicIncidentDto[];
  prace: PublicMaintenanceDto[];
  teraz: string;
}) {
  const dni = services[0]?.days ?? [];
  const od = poczatekPomiarow(services);
  const okno = `ostatnie ${ileDni(dni.length)}`;
  return (
    <section className="sv-uslugi" aria-labelledby="uslugi-h">
      <div className="sv-sek-glowka">
        <h2 id="uslugi-h" className="sv-h">
          Usługi
        </h2>
        <span className="st-mono sv-meta">
          {od > 0 && od < dni.length ? `${okno} · pomiary od ${dzienKrotko(dni[od].date)}` : okno}
        </span>
      </div>

      <ul className="sv-lista">
        {services.map((s) => {
          const start = pierwszyPomiar(s.days);
          // Procent z API liczy tylko dni z próbkami — mówimy wprost, z jakiego okresu jest.
          const okres =
            start > 0 && start < s.days.length
              ? `Dostępność z dni z pomiarami: od ${dzienKrotko(s.days[start].date)} do dziś`
              : `Dostępność z ostatnich ${ileDni(dni.length)}, liczona z dni z pomiarami`;
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
              <PasekDni
                nazwa={s.name}
                dni={s.days}
                pierwszyPomiar={start}
                zdarzenia={zdarzeniaDni(s.name, zdarzenia, prace, teraz)}
              />
              <span className="sv-ms st-mono">{s.avgLatencyMs !== null ? `${s.avgLatencyMs} ms` : '—'}</span>
              <span className="sv-proc" title={okres}>
                <span className="st-sr">{okres}: </span>
                {pct(s.uptime90Pct)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="sv-wiersz sv-os-wiersz" aria-hidden="true">
        <span />
        <div className="sv-os st-mono">
          {dni.length > DNI_NA_TELEFONIE ? (
            <span>
              <span className="sv-tylko-tel">{ileDni(DNI_NA_TELEFONIE)} temu</span>
              <span className="sv-tylko-komp">{ileDni(dni.length)} temu</span>
            </span>
          ) : (
            <span>{ileDni(dni.length)} temu</span>
          )}
          <span>dziś</span>
        </div>
      </div>

      <div className="sv-legenda" aria-label="Legenda kolorów">
        {(['ok', 'krotkie', 'spowolnienie', 'awaria', 'prace', 'brak', ...(od > 0 ? (['przed'] as const) : [])] as const).map(
          (k) => (
            <span key={k}>
              <i data-k={k} />
              {k === 'krotkie' ? 'krótkie zakłócenie (do 5 min)' : OPIS_KLASY[k]}
            </span>
          ),
        )}
      </div>
    </section>
  );
}

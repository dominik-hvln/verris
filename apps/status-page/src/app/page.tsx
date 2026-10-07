import {
  fetchPublicStatus,
  type PublicIncidentDto,
  type PublicMaintenanceDto,
  type PublicServiceDto,
  type PublicStatusDto,
} from '@/lib/api';
import Link from 'next/link';
import { czasTrwania, dataKrotko, godzina, pct, przedzial } from '@/lib/format';
import { Uslugi } from './uslugi';

export const revalidate = 30;

export default async function StatusPage() {
  let payload: PublicStatusDto | null = null;
  try {
    payload = await fetchPublicStatus();
  } catch {
    // Treści błędu nie pokazujemy — w komunikacie sieciowym bywają adresy wewnętrzne.
    payload = null;
  }

  return (
    <>
      <header className="st-header">
        <div className="st-wrap">
          <Link href="/" className="st-brand" aria-label="Verris — status usług">
            <Logo />
            verris <small>status</small>
          </Link>
          <Link href="/zaufanie" className="st-btn">
            Zaufanie i gwarancje
          </Link>
        </div>
      </header>

      <main className="st-wrap" style={{ marginTop: 20, paddingBottom: 40 }}>
        {payload ? <Widok data={payload} /> : <Niedostepny />}

        <footer className="st-footer">
          <p>
            Sondy sprawdzają usługi co 30 sekund. Dostępność to odsetek udanych prób w danym okresie; dni liczymy w czasie
            polskim, a dzień bez pomiarów oznaczamy jako „brak danych”, nie jako „działa”.
          </p>
          <p>SLA: 99,5% w miesiącu — zasady rekompensat opisuje regulamin.</p>
        </footer>
      </main>
    </>
  );
}

function Widok({ data }: { data: PublicStatusDto }) {
  const { services } = data;
  const wykres = services.find((s) => s.key === 'strony' && maDane(s)) ?? services.find(maDane);
  const zdarzenia = scalZdarzenia(data.activeIncidents, data.recentIncidents);

  return (
    <>
      <Baner data={data} />

      {services.length > 0 ? (
        <Uslugi services={services} />
      ) : (
        <div className="st-card st-empty" style={{ marginTop: 24 }}>
          Brak skonfigurowanych sond — stan usług pojawi się tutaj po ich uruchomieniu.
        </div>
      )}

      {services.length > 0 ? (
        <div className="st-panels" style={wykres ? undefined : { gridTemplateColumns: '1fr' }}>
          {wykres ? <Czas usluga={wykres} /> : null}
          <Dostepnosc a={data.availability} />
        </div>
      ) : null}

      <section aria-labelledby="zdarzenia-h" style={{ marginTop: 28 }}>
        <h2 id="zdarzenia-h" className="st-h2">
          Historia zdarzeń
        </h2>
        {data.maintenance.length === 0 && zdarzenia.length === 0 ? (
          <div className="st-card st-empty" style={{ marginTop: 12 }}>
            Brak zdarzeń do pokazania. Gdy coś się wydarzy, opiszemy to tutaj: od wykrycia do rozwiązania.
          </div>
        ) : (
          <ul className="st-events">
            {data.maintenance.map((w) => (
              <Prace key={w.id} w={w} />
            ))}
            {zdarzenia.map((z) => (
              <Zdarzenie key={z.id} z={z} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const maDane = (s: PublicServiceDto) => s.latency24h.some((h) => h.avgLatencyMs !== null);

function scalZdarzenia(aktywne: PublicIncidentDto[], ostatnie: PublicIncidentDto[]): PublicIncidentDto[] {
  const widziane = new Set<string>();
  return [...aktywne, ...ostatnie].filter((z) => !widziane.has(z.id) && widziane.add(z.id));
}

const BANER = {
  OK: { tytul: 'Wszystkie usługi działają', ikona: 'ok' },
  DEGRADED: { tytul: 'Część usług działa wolniej lub z przerwami', ikona: 'warn' },
  DOWN: { tytul: 'Awaria — część usług jest niedostępna', ikona: 'bad' },
  NONE: { tytul: 'Brak danych o usługach', ikona: 'none' },
} as const;

function Baner({ data }: { data: PublicStatusDto }) {
  const stan = data.services.length === 0 ? 'NONE' : data.overall;
  const b = BANER[stan];
  return (
    <div className="st-banner" data-state={stan}>
      <div className="st-banner-main">
        <span className="st-banner-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {b.ikona === 'ok' ? <path d="M5 11.5l4 4L17 7" /> : null}
            {b.ikona === 'warn' ? <path d="M11 5v7M11 17v.01" /> : null}
            {b.ikona === 'bad' ? <path d="M6 6l10 10M16 6L6 16" /> : null}
            {b.ikona === 'none' ? <path d="M6 11h10" /> : null}
          </svg>
        </span>
        <h1>{b.tytul}</h1>
      </div>
      <div className="st-banner-meta">
        <span>Stan na {godzina(data.generatedAt)} · odświeżamy co 30 s</span>
        <span>
          <strong className="st-mono">{pct(data.availability.d90)}</strong> dostępność, 90 dni
        </span>
      </div>
    </div>
  );
}

function Czas({ usluga }: { usluga: PublicServiceDto }) {
  const wartosci = usluga.latency24h.map((h) => h.avgLatencyMs);
  const max = Math.max(...wartosci.map((v) => v ?? 0), 1);
  return (
    <section className="st-card st-panel" aria-labelledby="czas-h">
      <div className="st-panel-head">
        <strong id="czas-h">Czas odpowiedzi — {usluga.name.toLowerCase()}, 24 h</strong>
        {usluga.avgLatencyMs !== null ? <span className="st-mono" style={{ fontSize: 13 }}>średnio {usluga.avgLatencyMs} ms</span> : null}
      </div>
      <div className="st-chart" role="group" aria-label="Średni czas odpowiedzi godzina po godzinie">
        {usluga.latency24h.map((h) => {
          const opis = h.avgLatencyMs !== null ? `${godzina(h.hour)}: ${h.avgLatencyMs} ms` : `${godzina(h.hour)}: brak danych`;
          return (
            <span
              key={h.hour}
              role="img"
              title={opis}
              aria-label={opis}
              data-empty={h.avgLatencyMs === null ? '' : undefined}
              style={{ height: h.avgLatencyMs === null ? undefined : `${Math.max(6, Math.round((h.avgLatencyMs / max) * 100))}%` }}
            />
          );
        })}
      </div>
      <div className="st-axis st-mono">
        <span>24 h temu</span>
        <span>teraz</span>
      </div>
    </section>
  );
}

function Dostepnosc({ a }: { a: PublicStatusDto['availability'] }) {
  return (
    <section className="st-card st-panel" aria-labelledby="dost-h">
      <strong id="dost-h" style={{ color: 'var(--strong)' }}>
        Dostępność
      </strong>
      <dl className="st-avail">
        {(
          [
            ['24 godziny', a.h24],
            ['7 dni', a.d7],
            ['30 dni', a.d30],
            ['90 dni', a.d90],
          ] as const
        ).map(([nazwa, v]) => (
          <div key={nazwa}>
            <dt>{nazwa}</dt>
            <dd className="st-mono">{pct(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="st-note">Wszystkie usługi łącznie. Okresy bez pomiarów nie wchodzą do średniej.</p>
    </section>
  );
}

function Prace({ w }: { w: PublicMaintenanceDto }) {
  return (
    <li className="st-card st-event">
      <div className="st-event-head">
        <strong>Planowane prace: {w.title}</strong>
        <span className="st-tag" data-tone="warn">
          {w.status === 'IN_PROGRESS' ? 'w toku' : 'zaplanowane'}
        </span>
      </div>
      <p className="st-event-when st-mono">{przedzial(w.scheduledStart, w.scheduledEnd)}</p>
      {w.publicMessage ? <p className="st-event-msg">{w.publicMessage}</p> : null}
    </li>
  );
}

function Zdarzenie({ z }: { z: PublicIncidentDto }) {
  const trwa = z.status === 'OPEN';
  const kiedy = z.resolvedAt
    ? `${przedzial(z.startedAt, z.resolvedAt)}${z.durationMinutes !== null ? ` · ${czasTrwania(z.durationMinutes)}` : ''}`
    : `${dataKrotko(z.startedAt)}, ${godzina(z.startedAt)} · trwa`;
  return (
    <li className="st-card st-event">
      <div className="st-event-head">
        <strong>{z.title}</strong>
        <span className="st-tag" data-tone={trwa ? (z.severity === 'MAJOR' ? 'bad' : 'warn') : 'ok'}>
          {trwa ? 'trwa' : 'rozwiązane'}
        </span>
      </div>
      <p className="st-event-when st-mono">
        {z.service} · {kiedy}
      </p>
      {/* Oś czasu tylko z tego, co zapisujemy: wykrycie, komunikat zespołu, rozwiązanie. */}
      <ol className="st-timeline">
        {z.resolvedAt ? (
          <li data-tone="ok">
            <time dateTime={z.resolvedAt}>{godzina(z.resolvedAt)}</time>Rozwiązane
          </li>
        ) : null}
        {z.publicMessage ? (
          <li>
            <b>Komunikat</b>
            {z.publicMessage}
          </li>
        ) : null}
        <li data-tone={trwa ? 'bad' : undefined}>
          <time dateTime={z.startedAt}>{godzina(z.startedAt)}</time>Wykryte
        </li>
      </ol>
    </li>
  );
}

function Niedostepny() {
  return (
    <div className="st-banner" data-state="NONE" role="alert">
      <div className="st-banner-main">
        <span className="st-banner-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M11 5v7M11 17v.01" />
          </svg>
        </span>
        <h1>Nie udało się pobrać statusu</h1>
      </div>
      <div className="st-banner-meta">
        <span>To problem tej strony, nie musi oznaczać awarii usług. Spróbuj odświeżyć za chwilę.</span>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="20 24 60 60" aria-hidden="true">
      <rect x="20" y="24" width="60" height="60" rx="14" fill="#0f7a52" />
      <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#34e5a0" fillRule="evenodd" transform="translate(0 0)" />
    </svg>
  );
}

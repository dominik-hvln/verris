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

/**
 * Znak i sygnet jak w Verris Poczta (ops/roundcube/verris_marka/logo.svg): emblemat w ciemnym kwadracie,
 * napis „verris”, pod nim po prawej nazwa usługi. Wersja na ciemne tło — jasny napis, podpis w mięcie.
 */
function Logo() {
  return (
    <>
      <svg className="st-znak" viewBox="0 0 80 80" aria-hidden="true">
        <rect x="0.5" y="0.5" width="79" height="79" rx="18" fill="#0c1a14" stroke="rgba(255,255,255,0.16)" />
        <g transform="scale(0.8)">
          <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#f4f4ee" fillRule="evenodd" />
          <path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34e5a0" strokeWidth="1.6" />
        </g>
      </svg>
      <span className="st-sygnet">
        <svg viewBox="0 0 273.11 80.81" aria-hidden="true">
          <path d="M20.02 79.49 0 26.76H19.14L30.71 66.85H29.44L40.97 26.76H60.11L40.14 79.49ZM86.03 80.81Q78.21 80.81 71.75 77.42Q65.28 74.02 61.42 67.8Q57.56 61.57 57.56 53.03Q57.56 44.58 61.32 38.4Q65.08 32.23 71.53 28.83Q77.97 25.44 86.03 25.44Q90.47 25.44 95.04 26.76Q99.6 28.08 103.46 31.45Q107.32 34.81 109.66 40.89Q112 46.97 112 56.45H68.55V47.46H96.72L95.45 49.85Q95.06 45.26 93.67 42.43Q92.28 39.6 90.2 38.31Q88.13 37.01 85.54 37.01Q81.97 37.01 79.7 39.11Q77.43 41.21 76.36 44.85Q75.29 48.49 75.29 53.12Q75.29 60.11 77.8 64.31Q80.31 68.51 85.88 68.51Q89.3 68.51 91.84 66.72Q94.38 64.94 95.84 61.08L111.08 64.7Q109.22 70.46 105.24 74.02Q101.26 77.59 96.18 79.2Q91.11 80.81 86.03 80.81ZM116.93 79.49V26.76H133.58V38.92L132.85 37.26Q135.43 31.2 139.9 28.32Q144.37 25.44 149.94 25.44Q151.5 25.44 153.16 25.68Q154.82 25.93 156.48 26.51L155.36 40.82Q151.99 39.89 148.96 39.89Q146.22 39.89 143.59 40.8Q140.95 41.7 138.8 43.82Q136.65 45.95 135.36 49.66Q134.07 53.37 134.07 58.98V79.49ZM158.72 79.49V26.76H175.37V38.92L174.63 37.26Q177.22 31.2 181.69 28.32Q186.16 25.44 191.72 25.44Q193.29 25.44 194.95 25.68Q196.61 25.93 198.27 26.51L197.14 40.82Q193.78 39.89 190.75 39.89Q188.01 39.89 185.38 40.8Q182.74 41.7 180.59 43.82Q178.44 45.95 177.15 49.66Q175.86 53.37 175.86 58.98V79.49ZM201.48 79.49V26.76H218.62V79.49ZM210.08 21.48Q205.1 21.48 202.21 18.6Q199.33 15.72 199.33 10.74Q199.33 5.76 202.21 2.88Q205.1 0 210.08 0Q215.06 0 217.94 2.88Q220.82 5.76 220.82 10.74Q220.82 15.72 217.94 18.6Q215.06 21.48 210.08 21.48ZM248.59 80.81Q242.54 80.81 237 79.15Q231.46 77.49 227.65 73.88Q223.84 70.26 222.86 64.4L238.05 61.38Q238.44 65.14 240.78 67.09Q243.12 69.04 247.86 69.04Q252.4 69.04 254.4 67.48Q256.41 65.92 256.41 63.87Q256.41 62.06 254.75 60.52Q253.09 58.98 248.64 58.35L244.44 57.76Q241.56 57.37 238.19 56.64Q234.82 55.91 231.8 54.37Q228.77 52.83 226.87 50.05Q224.96 47.27 224.96 42.77Q224.96 37.5 227.79 33.62Q230.62 29.74 235.8 27.59Q240.98 25.44 247.91 25.44Q253.92 25.44 259.07 27.15Q264.22 28.86 267.76 32.25Q271.3 35.64 272.32 40.72L257.33 43.8Q256.99 42.19 256.16 40.6Q255.33 39.01 253.55 37.96Q251.77 36.91 248.59 36.91Q245.18 36.91 243.37 38.21Q241.56 39.5 241.56 41.5Q241.56 43.21 242.88 44.26Q244.2 45.31 246.35 45.92Q248.5 46.53 250.99 46.92L256.06 47.66Q260.26 48.24 264.17 49.95Q268.08 51.66 270.59 54.88Q273.11 58.11 273.11 63.33Q273.11 69.09 269.88 73Q266.66 76.9 261.09 78.86Q255.53 80.81 248.59 80.81Z" fill="currentColor" />
        </svg>
        <span className="st-usluga">Status</span>
      </span>
    </>
  );
}

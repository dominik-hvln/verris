import { AlertTriangle, CheckCircle2, Clock, Leaf, ShieldAlert, XCircle } from 'lucide-react';
import {
  fetchPublicStatus,
  type ProbeStatusDto,
  type PublicIncidentDto,
  type PublicStatusDto,
  type ServerStatusDto,
  type ServiceState,
} from '@/lib/api';

export const revalidate = 30;

export default async function StatusPage() {
  let payload: PublicStatusDto | null = null;
  let error: string | null = null;
  try {
    payload = await fetchPublicStatus();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <main className="min-h-screen px-6 py-12 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400">
              <Leaf className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Verris Status</h1>
              <p className="text-sm text-neutral-400">Aktualny stan serwerów i usług</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/zaufanie"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-white/[0.08]"
            >
              <ShieldAlert className="h-4 w-4" /> Zaufanie i gwarancje
            </a>
            {payload ? <RefreshNote generatedAt={payload.generatedAt} /> : null}
          </div>
        </header>

        {error ? (
          <ErrorBanner message={error} />
        ) : payload ? (
          <>
            <OverallBanner state={payload.overall} />

            {payload.activeIncidents.length > 0 ? (
              <IncidentsBlock title="Aktywne incydenty" incidents={payload.activeIncidents} />
            ) : null}

            <section className="mt-10 space-y-4">
              <h2 className="text-lg font-bold">Serwery i usługi</h2>
              <div className="space-y-4">
                {payload.servers.length === 0 ? (
                  <EmptyServers />
                ) : (
                  payload.servers.map((server) => <ServerCard key={server.id} server={server} />)
                )}
              </div>
            </section>

            {payload.recentIncidents.length > 0 ? (
              <IncidentsBlock
                title="Ostatnie incydenty (10)"
                incidents={payload.recentIncidents}
                showResolved
              />
            ) : null}

            <Legend />
          </>
        ) : (
          <p className="text-neutral-400">Ładowanie...</p>
        )}

        <footer className="mt-16 border-t border-white/5 pt-6 text-sm text-neutral-500">
          <p>
            Probes są aktualizowane co 30 sekund z punktu widzenia naszej kontroli + dodatkowo z
            samego serwera. <strong>Live %</strong> to faktyczny uptime z ostatnich 30 dni;{' '}
            <strong>Deklarowany SLA</strong> to nasze zobowiązanie umowne.
          </p>
        </footer>
      </div>
    </main>
  );
}

function OverallBanner({ state }: { state: ServiceState }) {
  const visual: Record<ServiceState, { tone: string; icon: React.ReactNode; label: string }> = {
    OK: {
      tone: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-100',
      icon: <CheckCircle2 className="h-6 w-6" />,
      label: 'Wszystkie systemy działają',
    },
    DEGRADED: {
      tone: 'border-amber-400/30 bg-amber-400/5 text-amber-100',
      icon: <AlertTriangle className="h-6 w-6" />,
      label: 'Pogorszona jakość usług',
    },
    DOWN: {
      tone: 'border-rose-400/30 bg-rose-400/5 text-rose-100',
      icon: <XCircle className="h-6 w-6" />,
      label: 'Zakłócenie działania',
    },
  };
  const v = visual[state];
  return (
    <div className={`flex items-center gap-4 rounded-3xl border ${v.tone} p-6`}>
      <div className="rounded-2xl border border-current/30 bg-black/20 p-3">{v.icon}</div>
      <div>
        <p className="text-xl font-bold">{v.label}</p>
        <p className="text-sm opacity-80">Sprawdzamy każdą usługę co 30 sekund.</p>
      </div>
    </div>
  );
}

function ServerCard({ server }: { server: ServerStatusDto }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02]">
      <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
        <div>
          <h3 className="font-semibold">{server.name}</h3>
          {server.region ? (
            <p className="text-xs text-neutral-500 uppercase tracking-widest">{server.region}</p>
          ) : null}
        </div>
        <StateChip state={server.state} />
      </header>
      <div className="divide-y divide-white/5">
        {server.probes.map((probe) => (
          <ProbeRow key={probe.id} probe={probe} />
        ))}
      </div>
    </article>
  );
}

function ProbeRow({ probe }: { probe: ProbeStatusDto }) {
  const live = Number.parseFloat(probe.computedUptimePct);
  const declared = Number.parseFloat(probe.declaredSlaPct);
  const meetingSla = live >= declared;
  return (
    <div className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[2fr_1fr_1fr_auto]">
      <div>
        <p className="font-mono text-sm break-all">
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 mr-2 text-xs text-neutral-300">
            {probe.kind}
          </span>
          {probe.label ?? probe.target}
        </p>
        {probe.label ? <p className="text-xs text-neutral-500 mt-1">{probe.target}</p> : null}
      </div>
      <Metric label="Live (30d)" value={`${live.toFixed(2)}%`} tone={meetingSla ? 'good' : 'bad'} />
      <Metric label="Deklarowany SLA" value={`${declared.toFixed(2)}%`} tone="muted" />
      <StateChip state={probe.state} compact />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'muted';
}) {
  const palette = {
    good: 'text-emerald-300',
    bad: 'text-rose-300',
    muted: 'text-neutral-300',
  }[tone];
  return (
    <div className="md:text-right">
      <p className="text-xs uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${palette}`}>{value}</p>
    </div>
  );
}

function StateChip({ state, compact = false }: { state: ServiceState; compact?: boolean }) {
  const v = {
    OK: { dot: 'bg-emerald-400', label: 'Działa' },
    DEGRADED: { dot: 'bg-amber-400', label: 'Pogorszone' },
    DOWN: { dot: 'bg-rose-400', label: 'Niedostępne' },
  }[state];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      } font-semibold`}
    >
      <span className={`h-2 w-2 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

function IncidentsBlock({
  title,
  incidents,
  showResolved = false,
}: {
  title: string;
  incidents: PublicIncidentDto[];
  showResolved?: boolean;
}) {
  return (
    <section className="mt-10 space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-3">
        {incidents.map((incident) => {
          const tone =
            incident.status === 'RESOLVED'
              ? 'border-white/5 bg-white/[0.02]'
              : incident.severity === 'MAJOR'
                ? 'border-rose-400/30 bg-rose-400/5'
                : 'border-amber-400/30 bg-amber-400/5';
          return (
            <article key={incident.id} className={`rounded-2xl border ${tone} p-4`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{incident.title}</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {incident.serverName} • {incident.probeKind} • {incident.probeTarget}
                  </p>
                  {incident.publicMessage ? (
                    <p className="text-sm text-neutral-200 mt-2">{incident.publicMessage}</p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    incident.status === 'OPEN'
                      ? 'border-rose-400/30 text-rose-200'
                      : 'border-emerald-400/30 text-emerald-200'
                  }`}
                >
                  {incident.status === 'OPEN' ? 'Aktywny' : 'Zamknięty'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Start:{' '}
                  {new Date(incident.startedAt).toLocaleString('pl-PL')}
                </span>
                {showResolved && incident.resolvedAt ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Rozwiązany:{' '}
                    {new Date(incident.resolvedAt).toLocaleString('pl-PL')}
                  </span>
                ) : null}
                {incident.durationMinutes !== null ? (
                  <span>Czas trwania: {incident.durationMinutes} min</span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Legend() {
  return (
    <section className="mt-12 grid grid-cols-1 gap-4 rounded-3xl border border-white/5 bg-white/[0.02] p-6 md:grid-cols-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-neutral-500">Live</p>
        <p className="mt-1 text-sm text-neutral-200">
          Faktyczny uptime z ostatnich 30 dni — agregat 1-minutowych prób z naszego prober'a +
          lokalnych testów na samym serwerze.
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-neutral-500">Deklarowany SLA</p>
        <p className="mt-1 text-sm text-neutral-200">
          Nasze zobowiązanie umowne — jeśli Live spadnie poniżej, mogą Ci przysługiwać kredyty SLA.
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-neutral-500">Severity</p>
        <p className="mt-1 text-sm text-neutral-200">
          MAJOR (HTTP/HTTPS/MySQL/DA-API) traktujemy jako pełne zakłócenie. MINOR (SMTP/IMAP/POP3)
          jako pogorszenie usługi.
        </p>
      </div>
    </section>
  );
}

function RefreshNote({ generatedAt }: { generatedAt: string }) {
  return (
    <p className="text-xs text-neutral-500">
      Aktualizacja: {new Date(generatedAt).toLocaleTimeString('pl-PL')}
    </p>
  );
}

function EmptyServers() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <ShieldAlert className="h-10 w-10 mx-auto text-neutral-500" />
      <h3 className="mt-4 text-xl font-bold">Brak skonfigurowanych probes</h3>
      <p className="mt-2 text-neutral-400 max-w-md mx-auto">
        Administrator nie skonfigurował jeszcze probes. Status pojawi się tutaj po ich dodaniu.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-rose-400/30 bg-rose-400/5 p-6 text-rose-200">
      <h3 className="text-lg font-bold">Nie udało się pobrać statusu</h3>
      <p className="text-sm mt-1 opacity-80">{message}</p>
    </div>
  );
}

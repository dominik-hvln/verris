'use client';

import { opisLokalizacji } from '@verris/contracts';

/**
 * PB-15 — ekran-wzorzec: widok usługi hostingowej w nowym wyglądzie
 * (docs/design/wzorzec-panelu.html). Tylko realne dane z API; czego API
 * jeszcze nie daje (technologia strony, ruch per domena), tego tu nie ma —
 * lista braków w docs/VERRIS.md („Mapa: obecny panel → nowy design").
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EVENT_WARN, powodBlokady, serviceEventLabel, widoczneDlaKlienta } from '@/lib/service-events';
import { ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ServiceConnectionInfoDto,
  ServiceDetailsDto,
  ServiceHealthSummaryDto,
  HostingDomainsResponseDto,
  HostingBackupsResponseDto,
} from '@verris/contracts';
import {
  fetchServiceDetailsAction as fetchServiceDetailsActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-service-actions';
import {
  fetchHostingUsageAction as fetchHostingUsageActionAkcja,
  type HostingUsageResponse,
} from '@/app/dashboard/services/[id]/hosting-usage-actions';
import { fetchServiceHealthAction } from '@/app/dashboard/services/[id]/hosting-health-actions';
import {
  fetchConnectionInfoAction as fetchConnectionInfoActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-connection-actions';
import {
  fetchHostingDomainsAction as fetchHostingDomainsActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  fetchOverviewExtrasAction,
  toggleAutoscalingAction,
  type OverviewExtras,
} from '@/app/dashboard/services/[id]/overview-extras-actions';
import { fetchSidebarUser } from '@/app/dashboard/sidebar-actions';
import { EcoModeCard } from '@/app/dashboard/services/[id]/autoscaling/eco-mode-card';
import { FirstStepsAssistant } from '@/components/hosting/FirstStepsAssistant';
import { HealthCheckDetails } from '@/components/hosting/HealthCheckDetails';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import {
  fetchHostingBackupsAction as fetchHostingBackupsActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-backup-actions';
import { clientFeatures } from '@/lib/client-features';
import { useModul } from '@/lib/feature-flags';
import {
  AccessList,
  Box,
  CopyValue,
  Kpi,
  KpiStrip,
  Label,
  Meter,
  SectionHead,
  Squares,
  StatusPill,
  Switch,
  backupDays,
  bucketize,
  comet,
  fmtMb,
  lastDaysLabels,
  procentGb,
  tip,
  type Tone,
} from '@/components/panel/v2';
import { Wykres } from '@/components/panel/wykres';
import { zOdpakowaniem } from '@/lib/wynik-akcji';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const fetchServiceDetailsAction = zOdpakowaniem(fetchServiceDetailsActionAkcja);
const fetchHostingUsageAction = zOdpakowaniem(fetchHostingUsageActionAkcja);
const fetchConnectionInfoAction = zOdpakowaniem(fetchConnectionInfoActionAkcja);
const fetchHostingDomainsAction = zOdpakowaniem(fetchHostingDomainsActionAkcja);
const fetchHostingBackupsAction = zOdpakowaniem(fetchHostingBackupsActionAkcja);

const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary';
const BTN_SM =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground hover:border-primary';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground';
const LINK = 'text-[12.5px] font-semibold text-primary underline decoration-1 underline-offset-[3px]';

function money(v: number | string, currency = 'PLN'): string {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'PLN' ? 'zł' : currency}`;
}

function date(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

const HEALTH: Record<ServiceHealthSummaryDto['label'], { tone: Tone; text: string }> = {
  healthy: { tone: 'data', text: 'Wszystko działa' },
  attention: { tone: 'warn', text: 'Wymaga uwagi' },
  critical: { tone: 'warn', text: 'Problem z usługą' },
  pending: { tone: 'muted', text: 'Sprawdzamy usługę' },
};

const PAYMENT_SOURCE: Record<string, string> = {
  WALLET: 'z portfela',
  STRIPE_CARD: 'kartą (automatycznie)',
  MANUAL: 'u opiekuna',
};

export default function ServiceOverviewV2({
  serviceId,
  onNavigate,
}: {
  serviceId: string;
  onNavigate: (tab: string) => void;
}) {
  // N-12: moduł EKO może wyłączyć operator flagą (brak flagi = jak dotąd).
  const eco = useModul('modul.eco');
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
  const [bladUslugi, setBladUslugi] = useState<string | null>(null);
  const [health, setHealth] = useState<ServiceHealthSummaryDto | null>(null);
  const [usage, setUsage] = useState<HostingUsageResponse | null>(null);
  const [conn, setConn] = useState<ServiceConnectionInfoDto | null>(null);
  const [domains, setDomains] = useState<HostingDomainsResponseDto | null>(null);
  const [extras, setExtras] = useState<OverviewExtras | null>(null);
  const [backups, setBackups] = useState<HostingBackupsResponseDto | null>(null);
  const [ecoPoints, setEcoPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [asBusy, setAsBusy] = useState(false);

  // Ładowanie stopniowe: nagłówek po samych danych usługi, reszta dociąga się osobno.
  // Wolne źródła (DirectAdmin, sonda zdrowia) nie blokują już całego ekranu.
  const load = useCallback(
    (forceHealth = false) => {
      // Server Actions Next.js idą z przeglądarki SZEREGOWO (kolejka), nie równolegle — więc dane usługi
      // wołamy PIERWSZE. Wcześniej stały na końcu kolejki za pięcioma wołaniami DirectAdmina: przy
      // niedostępnym węźle spinner „Wczytywanie usługi…” wisiał ok. 20 s (produkcja, 26.09).
      const detailsP = fetchServiceDetailsAction(serviceId);
      const later = <T,>(p: Promise<T>, set: (v: T) => void) => p.then(set).catch(() => undefined);
      void later(fetchHostingUsageAction(serviceId, '24h'), setUsage);
      void later(fetchConnectionInfoAction(serviceId), setConn);
      void later(fetchHostingDomainsAction(serviceId), setDomains);
      void later(fetchOverviewExtrasAction(serviceId), setExtras);
      void later(fetchHostingBackupsAction(serviceId), setBackups);
      if (clientFeatures.eco) {
        void later(fetchSidebarUser(), (me) => setEcoPoints(me ? (typeof me.ecoPoints === 'number' ? me.ecoPoints : 0) : null));
      }
      const healthP = later(fetchServiceHealthAction(serviceId, forceHealth), setHealth);
      // Łańcuch `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback
      // i zgłasza fałszywy setState w efekcie. Kolejność: usługa → spinner → zdrowie.
      return detailsP
        .then((svc) => {
          setService(svc);
          setHealth((h) => h ?? svc.health);
        })
        // Komunikat API (np. „Masz dostęp tylko do wybranych usług tego konta.”) zamiast ogólnego.
        .catch((e: unknown) => setBladUslugi(e instanceof Error && e.message ? e.message : null))
        .finally(() => setLoading(false))
        .then(() => healthP)
        .then(() => setRefreshing(false));
    },
    [serviceId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const cpu = useMemo(
    () => bucketize((usage?.rows ?? []).map((r) => ({ bucketStart: r.bucketStart, value: r.cpuUsageMax })), 24),
    [usage],
  );
  const ram = useMemo(
    () => bucketize((usage?.rows ?? []).map((r) => ({ bucketStart: r.bucketStart, value: r.memUsageMaxMb })), 24),
    [usage],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie usługi…
      </div>
    );
  }
  if (!service) return <p className="text-sm text-crit">{bladUslugi ?? 'Nie udało się wczytać usługi.'}</p>;

  const account = service.account;
  const blokada = powodBlokady(service.status, service.events);
  const needsBilling = blokada === 'platnosc';
  const perMonth = service.interval === 'MONTH' ? '/ mies.' : '/ rok';
  const h = HEALTH[health?.label ?? 'pending'];
  const diskUsed = usage?.rows.at(-1)?.diskUsageMb ?? conn?.diskMb.used ?? null;
  const diskLimit = account?.diskLimitMb ?? conn?.diskMb.limit ?? null;
  const bw = conn?.bandwidthMb;
  const cpuLimit = account?.cpuLimit ?? 100;
  const ramLimit = account?.ramLimitMb ?? null;
  const cpuPeak = cpu.values.length ? Math.max(...cpu.values) : null;
  const cpuHot = cpuPeak != null && cpuPeak / cpuLimit >= 0.8;
  const ramPeak = ram.values.length ? Math.max(...ram.values) : null;
  const ramNow = usage?.rows.at(-1)?.memUsageAvgMb ?? null;
  const diskPct = diskUsed != null && diskLimit ? Math.round((diskUsed / diskLimit) * 100) : null;
  const bwPct = bw?.used != null && bw.limit ? Math.round((bw.used / bw.limit) * 100) : null;
  const domainList = domains?.domains ?? [];
  const primary = domains?.primaryDomain ?? account?.domain ?? null;
  const as = extras?.autoscaling ?? null;
  const asEnabled = as?.enabled ?? service.autoscalingEnabled;

  const toggleAs = async (next: boolean) => {
    setAsBusy(true);
    const res = await toggleAutoscalingAction(serviceId, next);
    setAsBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(next ? 'Autoskalowanie włączone' : 'Autoskalowanie wyłączone — przy skoku ruchu strona może zwolnić');
    setExtras((x) => (x && x.autoscaling ? { ...x, autoscaling: { ...x.autoscaling, enabled: next } } : x));
  };

  const metric = (m: { used: number | null; limit: number | null } | undefined) =>
    m && m.used != null ? `${m.used} z ${m.limit ?? '∞'}` : '—';
  const pct = (m: { used: number | null; limit: number | null } | undefined) =>
    m && m.used != null && m.limit ? Math.round((m.used / m.limit) * 100) : 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {needsBilling ? (
        <button
          type="button"
          onClick={() => onNavigate('subscription')}
          className="w-full rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-left text-sm text-foreground"
        >
          {service.status === 'SUSPENDED' ? (
            <>
              <b>Usługa zawieszona z powodu braku płatności.</b>{' '}
              <span className="text-muted-foreground">
                Strona pokazuje odwiedzającym komunikat o zawieszeniu, dane są nietknięte. Opłać zaległość — usługa wróci automatycznie →
              </span>
            </>
          ) : (
            <>
              <b>Usługa czeka na płatność.</b>{' '}
              <span className="text-muted-foreground">Opłać, anuluj zamówienie lub zarządzaj rozliczeniem →</span>
            </>
          )}
        </button>
      ) : null}
      {blokada === 'partner' ? (
        <div className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-foreground">
          <b>Usługa wstrzymana przez partnera, który prowadzi Twoje konto.</b>{' '}
          <span className="text-muted-foreground">
            Strona i poczta nie działają do czasu wznowienia. Wznowić ją może partner albo nasza obsługa (kontakt@verris.pl).
            Kto jest Twoim partnerem i jak się od niego odpiąć — w <Link className="underline" href="/dashboard/settings">Ustawieniach</Link>.
          </span>
        </div>
      ) : null}
      {blokada === 'obsluga' ? (
        <div className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-foreground">
          <b>Usługa wstrzymana przez obsługę Verris.</b>{' '}
          <span className="text-muted-foreground">Aby poznać powód i ustalić wznowienie, otwórz zgłoszenie w Centrum pomocy albo napisz: kontakt@verris.pl.</span>
        </div>
      ) : null}

      {/* Nagłówek */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Label>
            Usługa{service.currentPeriodEnd ? ` · odnawia się ${date(service.currentPeriodEnd)}` : ''} · {money(service.renewalAmount ?? service.priceAmount, service.currency)} {perMonth}
          </Label>
          <h1 className="mb-2 mt-1.5 font-display text-[clamp(28px,4vw,40px)] font-extrabold leading-none tracking-[-0.03em] text-foreground">
            {service.plan.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-muted-foreground">
            <span data-tip={health?.summary ?? undefined}>
              <StatusPill tone={h.tone}>{h.text}</StatusPill>
            </span>
            {primary ? <span>{primary}{domainList.length > 1 ? ` + ${domainList.length - 1}` : ''}</span> : null}
            {account?.daUsername ? (
              <span className="inline-flex items-center gap-1.5">
                login <CopyValue value={account.daUsername} />
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={() => onNavigate('domains')}>
            <Plus className="h-4 w-4" /> Dodaj domenę
          </button>
          <button type="button" className={BTN} onClick={() => onNavigate('files')}>Pliki</button>
          <button type="button" className={BTN} onClick={() => onNavigate('mail')}>Poczta</button>
          <button
            type="button"
            className={BTN}
            disabled={refreshing}
            aria-label="Odśwież"
            data-tip="Odśwież dane i diagnostykę"
            onClick={() => {
              setRefreshing(true);
              void load(true);
            }}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Pasek liczb */}
      <div className="v2-comet rounded-[10px]" style={comet('a', 13, -2, 0.55)}>
      <KpiStrip>
        <Kpi
          label="Wydajność konta · 24 h"
          value={cpuPeak != null ? Math.round((cpuPeak / cpuLimit) * 100) : '—'}
          unit={cpuPeak != null ? '% limitu · szczyt' : undefined}
          foot={
            cpuHot ? (
              asEnabled ? (
                <span className="text-warn">przy limicie — autoskalowanie dokłada moc</span>
              ) : (
                <span className="text-warn">blisko limitu — rozważ autoskalowanie</span>
              )
            ) : (
              <span>{cpu.values.length ? 'w normie' : 'brak pomiarów z 24 h'}</span>
            )
          }
        >
          {cpu.values.length ? (
            <div className="mt-3">
              <Wykres
                wariant="slupki"
                punkty={cpu.values.map((v, i) => ({ v: (v / cpuLimit) * 100, label: `od ${cpu.labels[i] ?? ''}` }))}
                limit={100}
                format={(v) => `${Math.round(v)}% limitu CPU`}
                nazwa="Wydajność konta w ostatnich 24 godzinach: szczyt CPU w każdej godzinie, w procentach limitu"
                wysokosc={44}
              />
            </div>
          ) : null}
        </Kpi>
        <Kpi
          label="Pamięć (RAM)"
          value={ramPeak != null ? fmtMb(ramPeak).split(' ')[0] : '—'}
          unit={ramPeak != null ? `${fmtMb(ramPeak).split(' ')[1]} · szczyt 24 h` : undefined}
          foot={
            <span>
              {ramNow != null ? `teraz ${fmtMb(ramNow)}${ramLimit ? ` · limit ${fmtMb(ramLimit)}` : ''}` : 'brak pomiarów z 24 h'}
            </span>
          }
        >
          {ram.values.length ? (
            <div className="mt-3">
              <Wykres
                punkty={ram.values.map((v, i) => ({ v, label: `od ${ram.labels[i] ?? ''}` }))}
                limit={ramLimit}
                format={fmtMb}
                nazwa="Pamięć RAM w ostatnich 24 godzinach: szczyt w każdej godzinie"
                wysokosc={44}
              />
            </div>
          ) : null}
        </Kpi>
        <Kpi
          label="Dysk i transfer"
          foot={<span>{diskUsed != null && diskLimit ? `zostało ${fmtMb(diskLimit - diskUsed)} na dysku` : 'dane pojawią się po pierwszym pomiarze'}</span>}
        >
          <div className="flex flex-col text-[12.5px] text-muted-foreground">
            <div className="flex flex-wrap justify-between gap-x-2">
              <span>Dysk</span>
              <span className="ml-auto whitespace-nowrap font-mono text-foreground">{procentGb(diskUsed, diskLimit)}</span>
            </div>
            <Meter pct={diskPct ?? 0} tone={(diskPct ?? 0) >= 80 ? 'warn' : 'data'} tipText={tip(procentGb(diskUsed, diskLimit), 'miejsce na dysku')} />
            {/* Krótka etykieta mieści się z wartością w jednym wierszu; w wąskiej karcie wartość spada w całości pod etykietę. */}
            <div className="mt-3 flex flex-wrap justify-between gap-x-2">
              <span data-tip="Transfer w tym miesiącu">Transfer</span>
              <span className="ml-auto whitespace-nowrap font-mono text-foreground">{procentGb(bw?.used, bw?.limit)}</span>
            </div>
            {bw?.limit ? (
              <Meter pct={bwPct ?? 0} tone={(bwPct ?? 0) >= 80 ? 'warn' : 'data'} tipText={tip(procentGb(bw?.used, bw?.limit), 'transfer w tym miesiącu')} />
            ) : null}
          </div>
        </Kpi>
        <Kpi
          label="Kopie zapasowe"
          value={backups ? String(backups.rows.length) : '—'}
          unit={backups ? (backups.rows.length === 1 ? 'kopia' : 'kopii') : undefined}
          foot={
            <>
              <span>
                {backups?.offsite
                  ? backups.offsite.protected
                    ? `poza serwerem: ${date(backups.offsite.lastRunAt, false)}`
                    : backups.offsite.pending
                      ? 'poza serwerem: pierwsza w nocy'
                      : 'kopia poza serwerem: brak świeżej'
                  : health?.checks.backupFresh === false
                    ? 'brak świeżej kopii'
                    : 'kopie na koncie'}
              </span>
              <button type="button" className={LINK} onClick={() => onNavigate('backups')}>
                Przywróć…
              </button>
            </>
          }
        >
          <Squares
            items={backupDays(backups?.rows.map((r) => r.fileName) ?? []).map((ok, i, arr) => ({
              tone: ok ? ('data' as const) : ('muted' as const),
              tip: tip(ok ? 'Kopia zapasowa' : 'Brak kopii', lastDaysLabels(arr.length)[i] ?? ''),
            }))}
          />
        </Kpi>
      </KpiStrip>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* Duża kolumna (wzorzec): strony, zasoby konta, co się działo; potem prowadzenie i diagnostyka */}
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <SectionHead
              title="Domeny na tym hostingu"
              desc="Kliknij, żeby zarządzać domeną, DNS i SSL."
              action={<button type="button" className={BTN_SM} onClick={() => onNavigate('domains')}>Dodaj domenę</button>}
            />
            <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
              {domainList.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted-foreground">
                  {domains === null
                    ? 'Wczytywanie domen…'
                    : domains.fetchError
                      ? 'Nie udało się pobrać listy domen — spróbuj odświeżyć.'
                      : 'Brak domen. Dodaj pierwszą, żeby uruchomić stronę.'}
                </p>
              ) : (
                <table className="v2-stack w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">Domena</th>
                      <th className="px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">Rola</th>
                      <th>
                        <span className="sr-only">Szczegóły</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainList.map((d) => (
                      // Cały wiersz klikalny przez rozciągnięty link (after:inset-0), a nie <tr tabIndex onClick>:
                      // czytnik ekranu ogłasza wtedy „link, kowalski.pl” zamiast wiersza tabeli bez roli (4.1.2).
                      <tr key={d.name} className="group relative hover:bg-raised/50">
                        <td className="border-t border-line px-3 py-3 font-semibold text-foreground" data-label="Domena">
                          <Link
                            href={`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`}
                            className="after:absolute after:inset-0 after:content-['']"
                          >
                            {d.name}
                          </Link>
                        </td>
                        <td className="border-t border-line px-3 py-3 text-muted-foreground" data-label="Rola">{d.name === primary ? 'domena główna' : 'domena dodatkowa'}</td>
                        <td data-label="" className="w-8 border-t border-line px-3 py-3 text-muted-foreground">
                          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          <section>
            <SectionHead
              title="Zasoby konta"
              action={<button type="button" className={BTN_SM} onClick={() => onNavigate('usage')}>Zużycie i prognoza</button>}
            />
            <ul className="m-0 list-none rounded-[10px] border border-line bg-card p-0">
              {(
                [
                  ['Skrzynki pocztowe', conn?.emails],
                  ['Bazy danych', conn?.databases],
                  ['Konta FTP', conn?.ftpAccounts],
                  ['Liczba plików', conn?.inodes],
                ] as const
              ).map(([label, m]) => (
                <li key={label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-line px-4 py-3 [&+&]:border-t">
                  <b className="text-sm font-semibold text-foreground">{label}</b>
                  <span className="row-span-2 text-right text-[13px] tabular-nums">{metric(m)}</span>
                  <span className="col-start-1">
                    <Meter pct={pct(m)} tone={pct(m) >= 80 ? 'warn' : 'data'} tipText={m?.limit ? tip(`${pct(m)}% limitu`, label) : tip('bez limitu', label)} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <SectionHead title="Co się działo" desc="Zmiany w usłudze — nasze i Twoje." />
            <EventsFeed events={service.events} />
          </section>

          {!needsBilling && service.status === 'ACTIVE' ? (
            <FirstStepsAssistant health={health} productKind={service.productKind} onNavigate={onNavigate} />
          ) : null}

          {health ? (
            <section>
              <SectionHead title="Diagnostyka" desc={health.summary} />
              <HealthCheckDetails health={health} serviceId={serviceId} domain={account?.domain ?? null} onNavigate={onNavigate} />
            </section>
          ) : null}

          <DomainPointingPanel serviceId={serviceId} variant="compact" onGoToDomains={() => onNavigate('domains')} />
        </div>

        {/* Wąska kolumna (wzorzec): autoskalowanie, asystent, dane dostępowe, płatności */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="v2-comet rounded-[10px]" style={comet('c', 16, -5, 0.5)}>
          <Box
            title="Autoskalowanie"
            action={<Switch checked={asEnabled} onChange={toggleAs} disabled={asBusy || !as} label="Autoskalowanie" />}
          >
            <p className="mx-4 mt-1.5 text-[13.5px] text-muted-foreground">
              {asEnabled
                ? 'Przy nagłym ruchu dodajemy moc, opłata z portfela.'
                : 'Wyłączone — przy skoku ruchu strona może zwolnić, ale nic nie dopłacisz.'}
            </p>
            {asEnabled && as ? (
              <div className="px-4 pt-3">
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-muted-foreground">Bezpiecznik · 30 dni</span>
                  <span className="tabular-nums">
                    <b className="text-foreground">{money(as.spend30d, as.currency)}</b>{' '}
                    {as.maxCost > 0 ? `z ${money(as.maxCost, as.currency)}` : '· bez limitu'}
                  </span>
                </div>
                {as.maxCost > 0 ? (
                  <Meter
                    pct={(as.spend30d / as.maxCost) * 100}
                    tone={as.spend30d / as.maxCost >= 0.8 ? 'warn' : 'data'}
                    tipText={tip(`${Math.round((as.spend30d / as.maxCost) * 100)}% bezpiecznika`, 'powyżej limitu zasoby wracają do planu')}
                  />
                ) : null}
              </div>
            ) : null}
            {as?.disabledReason ? <p className="mx-4 mt-2 text-[12.5px] text-warn">{as.disabledReason}</p> : null}
            <div className="px-4 pb-3.5 pt-3">
              <Link href={`/dashboard/services/${serviceId}/autoscaling`} className={LINK}>
                Szczegóły, historia i portfel →
              </Link>
            </div>
          </Box>
          </div>

          <Box
            title="Dane dostępowe"
          >
            <p className="mx-4 mb-1.5 mt-1 text-[12.5px] text-muted-foreground">
              {conn?.fetchError ? 'Część danych chwilowo niedostępna.' : 'Kliknij adres, żeby go skopiować.'}
            </p>
            <AccessList
              items={[
                { label: 'Login konta (SSH, prefiks baz i kont FTP)', values: account?.daUsername ? [account.daUsername] : [] },
                { label: 'Adres serwera', values: conn?.ipv4 ? [conn.ipv4] : [] },
                { label: 'Serwer FTP', values: [conn?.ftpHost, conn?.ipv4].filter((v): v is string => !!v), port: '21' },
                ...(conn?.sshEnabled && conn.sshHost
                  ? [{ label: 'SSH', values: [conn.sshHost], port: conn.sshPort ? String(conn.sshPort) : null }]
                  : []),
                { label: 'Serwery DNS', values: conn?.nameservers ?? [] },
                { label: 'Poczta — odbiór (IMAP)', values: conn?.mailHost ? [conn.mailHost] : [], port: '993 SSL' },
                { label: 'Poczta — wysyłka (SMTP)', values: conn?.mailHost ? [conn.mailHost] : [], port: '465 SSL' },
                { label: 'Baza danych', values: ['localhost'], port: '3306' },
              ]}
            />
            {/* P-13 — gdzie fizycznie leżą dane usługi (region węzła albo ogólne EOG, gdy nieustalony). */}
            <p className="mx-4 mb-3 mt-2 text-[12.5px] text-muted-foreground">
              Dane usługi i kopie zapasowe: {opisLokalizacji(account?.server?.region).opis}. Kopie poza serwerem są
              szyfrowane i również przechowywane w EOG.{' '}
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                Podmioty przetwarzające dane
              </Link>
            </p>
          </Box>

          <Box
            title="Płatności za usługę"
            action={
              <StatusPill tone={needsBilling ? 'warn' : service.status === 'ACTIVE' ? 'data' : 'muted'}>
                {needsBilling ? 'do opłacenia' : service.isTrial ? 'okres próbny' : service.status === 'ACTIVE' ? 'opłacona' : 'nieaktywna'}
              </StatusPill>
            }
            footer={
              <>
                <button type="button" className={BTN_SM} onClick={() => onNavigate('subscription')}>Historia i faktury</button>
                <Link href={`/dashboard/services/${serviceId}/plan`} className={BTN_SM}>Zmień plan</Link>
              </>
            }
          >
            <div className="px-4 pt-2.5 font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] text-foreground tabular-nums">
              {money(service.renewalAmount ?? service.priceAmount, service.currency)}
              <small className="ml-1 font-mono text-[13px] font-medium tracking-normal text-muted-foreground">{perMonth}</small>
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 px-4 pb-1 pt-2 text-[13.5px] [&>dd]:m-0 [&>dd]:py-1.5 [&>dd]:text-right [&>dd]:text-foreground [&>dt]:py-1.5 [&>dt]:text-muted-foreground">
              <dt>{service.isTrial ? 'Koniec okresu próbnego' : 'Następna płatność'}</dt>
              <dd>
                <b>{date(service.isTrial ? service.trialEndsAt : service.currentPeriodEnd)}</b>
                {!service.isTrial ? ` · ${money(service.renewalAmount ?? service.priceAmount, service.currency)}` : ''}
              </dd>
              <dt>Sposób</dt>
              <dd>{PAYMENT_SOURCE[service.paymentSource] ?? '—'}</dd>
              <dt>Poprzednia</dt>
              <dd>{extras?.lastPayment ? `${date(extras.lastPayment.createdAt)} · ${money(extras.lastPayment.amount, extras.lastPayment.currency)}` : '—'}</dd>
              {as ? (
                <>
                  <dt>Autoskalowanie · 30 dni</dt>
                  <dd className="tabular-nums">{money(as.spend30d, as.currency)}</dd>
                </>
              ) : null}
              {extras?.wallet ? (
                <>
                  <dt>Saldo portfela</dt>
                  <dd className="tabular-nums"><b>{money(extras.wallet.balance, extras.wallet.currency)}</b></dd>
                </>
              ) : null}
            </dl>
          </Box>


          {eco && service.status !== 'CANCELED' && service.status !== 'EXPIRED' ? (
            <EcoModeCard subscriptionId={serviceId} ecoModeEnabled={service.ecoModeEnabled} ecoPoints={ecoPoints} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Historia zdarzeń usługi pogrupowana po dniach (Dziś / Wczoraj / data). */
function EventsFeed({ events }: { events: ServiceDetailsDto['events'] }) {
  const list = [...(events ?? [])].filter((e) => widoczneDlaKlienta(e.type)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 12);
  if (list.length === 0) {
    return <div className="rounded-[10px] border border-line bg-card px-4 py-5 text-sm text-muted-foreground">Na razie nic się nie działo.</div>;
  }
  const now = new Date();
  const today = now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday = y.toDateString();
  const dayOf = (iso: string) => {
    const d = new Date(iso).toDateString();
    return d === today ? 'Dziś' : d === yesterday ? 'Wczoraj' : new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
  };
  const rows = list.map((e, i) => ({ e, day: dayOf(e.createdAt), head: i === 0 || dayOf(list[i - 1]!.createdAt) !== dayOf(e.createdAt) }));
  return (
    <div className="rounded-[10px] border border-line bg-card py-1">
      {rows.map(({ e, day, head }) => {
        const warn = EVENT_WARN.has(e.type);
        const label = serviceEventLabel(e.type);
        return (
          <div key={e.id}>
            {head ? <Label className="px-4 pb-1 pt-2.5">{day}</Label> : null}
            <div className="grid grid-cols-[18px_1fr_auto] items-start gap-3 px-4 py-2">
              <span className={`mt-1.5 h-[9px] w-[9px] justify-self-center rounded-full border-2 ${warn ? 'border-warn' : 'border-data'}`} />
              <p className="m-0 text-sm text-foreground">{label}</p>
              <time className="pt-0.5 font-mono text-xs text-muted-foreground" suppressHydrationWarning>
                {new Date(e.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
          </div>
        );
      })}
    </div>
  );
}


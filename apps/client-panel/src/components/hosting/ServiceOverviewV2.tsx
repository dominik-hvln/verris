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
import { useRouter } from 'next/navigation';
import { EVENT_WARN, serviceEventLabel } from '@/lib/service-events';
import { ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ServiceConnectionInfoDto,
  ServiceDetailsDto,
  ServiceHealthSummaryDto,
  HostingDomainsResponseDto,
  HostingBackupsResponseDto,
} from '@verris/contracts';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { fetchHostingUsageAction, type HostingUsageResponse } from '@/app/dashboard/services/[id]/hosting-usage-actions';
import { fetchServiceHealthAction } from '@/app/dashboard/services/[id]/hosting-health-actions';
import { fetchConnectionInfoAction } from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  fetchOverviewExtrasAction,
  toggleAutoscalingAction,
  type OverviewExtras,
} from '@/app/dashboard/services/[id]/overview-extras-actions';
import { fetchSidebarUser } from '@/app/dashboard/sidebar-actions';
import { EcoModeCard } from '@/app/dashboard/services/[id]/autoscaling/eco-mode-card';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { FirstStepsAssistant } from '@/components/hosting/FirstStepsAssistant';
import { HealthCheckDetails } from '@/components/hosting/HealthCheckDetails';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import HostingPanelCard from '@/components/hosting/HostingPanelCard';
import { fetchHostingBackupsAction } from '@/app/dashboard/services/[id]/hosting-backup-actions';
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
  MiniBars,
  SectionHead,
  Squares,
  StackBar,
  StatusPill,
  Switch,
  backupDays,
  bucketize,
  comet,
  fmtMb,
  lastDaysLabels,
  tip,
  type Tone,
} from '@/components/panel/v2';

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
  MANUAL: 'przelewem',
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
  const { links } = useHostingLinks();
  const router = useRouter();
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
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
      // i zgłasza fałszywy setState w efekcie. Kolejność jak wcześniej: usługa → spinner → zdrowie.
      return fetchServiceDetailsAction(serviceId)
        .then((svc) => {
          setService(svc);
          setHealth((h) => h ?? svc.health);
        })
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
    () => bucketize((usage?.rows ?? []).map((r) => ({ bucketStart: r.bucketStart, value: r.cpuUsageMax })), 8),
    [usage],
  );
  const ram = useMemo(
    () => bucketize((usage?.rows ?? []).map((r) => ({ bucketStart: r.bucketStart, value: r.memUsageMaxMb })), 8),
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
  if (!service) return <p className="text-sm text-crit">Nie udało się wczytać usługi.</p>;

  const account = service.account;
  const needsBilling = ['PENDING_PAYMENT', 'PAST_DUE', 'SUSPENDED'].includes(service.status);
  const perMonth = service.interval === 'MONTH' ? '/ mies.' : '/ rok';
  const h = HEALTH[health?.label ?? 'pending'];
  const diskUsed = usage?.rows.at(-1)?.diskUsageMb ?? conn?.diskMb.used ?? null;
  const diskLimit = account?.diskLimitMb ?? conn?.diskMb.limit ?? null;
  const bw = conn?.bandwidthMb;
  const cpuLimit = account?.cpuLimit ?? 100;
  const ramLimit = account?.ramLimitMb ?? null;
  const cpuPeak = cpu.values.length ? Math.max(...cpu.values) : null;
  const cpuHot = cpuPeak != null && cpuPeak / cpuLimit >= 0.8;
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
          <b>Usługa czeka na płatność.</b>{' '}
          <span className="text-muted-foreground">Opłać, anuluj zamówienie lub zarządzaj rozliczeniem →</span>
        </button>
      ) : null}

      {/* Nagłówek */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Label>
            Usługa{service.currentPeriodEnd ? ` · odnawia się ${date(service.currentPeriodEnd)}` : ''} · {money(service.priceAmount, service.currency)} {perMonth}
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
          label="Miejsce na dysku"
          value={diskUsed != null ? fmtMb(diskUsed).split(' ')[0] : '—'}
          unit={diskUsed != null ? `${fmtMb(diskUsed).split(' ')[1]} / ${fmtMb(diskLimit)}` : undefined}
          foot={<span>{diskUsed != null && diskLimit ? `zostało ${fmtMb(diskLimit - diskUsed)}` : 'dane pojawią się po pierwszym pomiarze'}</span>}
        >
          <StackBar
            total={diskLimit ?? 1}
            parts={diskUsed != null ? [{ label: 'Zajęte', value: diskUsed, color: 'var(--data)', detail: `${fmtMb(diskUsed)} z ${fmtMb(diskLimit)}` }] : []}
          />
        </Kpi>
        <Kpi
          label="Transfer · ten miesiąc"
          value={bw?.used != null ? fmtMb(bw.used).split(' ')[0] : '—'}
          unit={bw?.used != null ? `${fmtMb(bw.used).split(' ')[1]} / ${bw.limit ? fmtMb(bw.limit) : 'bez limitu'}` : undefined}
          foot={<span>{bw?.limit ? `${Math.round(((bw.used ?? 0) / bw.limit) * 100)}% limitu` : 'bez limitu transferu'}</span>}
        >
          {bw?.limit ? <Meter pct={((bw.used ?? 0) / bw.limit) * 100} tipText={tip(fmtMb(bw.used), `z ${fmtMb(bw.limit)} w tym miesiącu`)} /> : <div className="h-[11px]" />}
        </Kpi>
        <Kpi
          label="Wydajność konta · 24 h"
          value={cpuPeak != null ? Math.round((cpuPeak / cpuLimit) * 100) : '—'}
          unit={cpuPeak != null ? '% limitu' : undefined}
          foot={
            cpuHot ? (
              <span className="text-warn">blisko limitu — rozważ autoskalowanie</span>
            ) : (
              <span data-tip={ram.values.length ? tip(`RAM szczyt ${fmtMb(Math.max(...ram.values))}`, `limit ${fmtMb(ramLimit)}`) : undefined}>
                {cpu.values.length ? `w normie${ram.values.length ? ` · RAM ${fmtMb(Math.max(...ram.values))}` : ''}` : 'brak pomiarów z 24 h'}
              </span>
            )
          }
        >
          {cpu.values.length ? (
            <MiniBars values={cpu.values} labels={cpu.labels} unit="% CPU (szczyt)" lastTone={cpuHot ? 'warn' : 'data'} format={(v) => String(Math.round(v))} />
          ) : null}
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
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {domainList.map((d) => (
                      <tr
                        key={d.name}
                        tabIndex={0}
                        className="group cursor-pointer hover:bg-raised/50"
                        onClick={() => router.push(`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`)}
                        onKeyDown={(e) => e.key === 'Enter' && router.push(`/dashboard/services/${serviceId}/sites/${encodeURIComponent(d.name)}`)}
                      >
                        <td className="border-t border-line px-3 py-3 font-semibold text-foreground" data-label="Domena">{d.name}</td>
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
            <SectionHead title="Zasoby konta" />
            <ul className="m-0 list-none rounded-[10px] border border-line bg-card p-0">
              {(
                [
                  ['Skrzynki pocztowe', conn?.emails],
                  ['Bazy danych', conn?.databases],
                  ['Konta FTP', conn?.ftpAccounts],
                  ['Pliki (i-węzły)', conn?.inodes],
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

          <AssistantBubble recommendations={service.recommendations} serviceId={serviceId} onNavigate={onNavigate} />

          <Box
            title="Dane dostępowe"
            footer={
              <>
                {links.emailUrl ? <a href={links.emailUrl} target="_blank" rel="noopener noreferrer" className={BTN_SM}>Webmail</a> : null}
                {links.databasesUrl ? <a href={links.databasesUrl} target="_blank" rel="noopener noreferrer" className={BTN_SM}>phpMyAdmin</a> : null}
              </>
            }
          >
            <p className="mx-4 mb-1.5 mt-1 text-[12.5px] text-muted-foreground">
              {conn?.fetchError ? 'Część danych chwilowo niedostępna.' : 'Kliknij adres, żeby go skopiować.'}
            </p>
            <AccessList
              items={[
                { label: 'Login konta (FTP, SSH, panel)', values: account?.daUsername ? [account.daUsername] : [] },
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
              {money(service.priceAmount, service.currency)}
              <small className="ml-1 font-mono text-[13px] font-medium tracking-normal text-muted-foreground">{perMonth}</small>
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 px-4 pb-1 pt-2 text-[13.5px] [&>dd]:m-0 [&>dd]:py-1.5 [&>dd]:text-right [&>dd]:text-foreground [&>dt]:py-1.5 [&>dt]:text-muted-foreground">
              <dt>{service.isTrial ? 'Koniec okresu próbnego' : 'Następna płatność'}</dt>
              <dd>
                <b>{date(service.isTrial ? service.trialEndsAt : service.currentPeriodEnd)}</b>
                {!service.isTrial ? ` · ${money(service.priceAmount, service.currency)}` : ''}
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

          <HostingPanelCard />

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
  const list = [...(events ?? [])].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 12);
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

/** Dymek asystenta (wzorzec) — rekomendacje usługi zamiast osobnej karty. */
function AssistantBubble({
  recommendations,
  serviceId,
  onNavigate,
}: {
  recommendations: ServiceDetailsDto['recommendations'];
  serviceId: string;
  onNavigate: (tab: string) => void;
}) {
  const items = recommendations.filter((r) => !(r.severity === 'info' && r.title.startsWith('Usługa działa')));
  const first = items[0];
  const act = (type: string) => {
    if (type === 'plan') return { label: 'Zobacz plany', href: `/dashboard/services/${serviceId}/plan` };
    if (type === 'autoscaling') return { label: 'Ustaw autoskalowanie', href: `/dashboard/services/${serviceId}/autoscaling` };
    if (type === 'backup') return { label: 'Przejdź do kopii', tab: 'backups' };
    return { label: 'Sprawdź domenę i DNS', tab: 'domains' };
  };
  return (
    <section aria-label="Asystent">
      <SectionHead title="Asystent" />
      <div className="v2-comet relative rounded-xl border border-primary/30 bg-card p-4 shadow-[0_0_0_1px_rgba(52,229,160,0.08),0_18px_40px_-22px_rgba(0,0,0,0.8)]" style={comet('b', 10, -6, 0.8)}>
        <Label className="mb-2">{first ? 'zauważyłem' : 'na dziś'}</Label>
        {first ? (
          <>
            <p className="mb-3 text-[14.5px] text-foreground">
              <b className="font-semibold">{first.title}</b>
              <br />
              <span className="text-[13.5px] text-muted-foreground">{first.body}</span>
            </p>
            {(() => {
              const a = act(first.type);
              return a.href ? (
                <Link href={a.href} className={BTN_SM.replace('bg-card', 'bg-primary text-primary-foreground border-primary font-semibold')}>{a.label}</Link>
              ) : (
                <button type="button" onClick={() => onNavigate(a.tab!)} className={BTN_SM.replace('bg-card', 'bg-primary text-primary-foreground border-primary font-semibold')}>{a.label}</button>
              );
            })()}
            {items.length > 1 ? (
              <ul className="mt-3 list-none space-y-1 p-0 text-[12.5px] text-muted-foreground">
                {items.slice(1, 4).map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${r.severity === 'critical' ? 'bg-crit' : r.severity === 'warning' ? 'bg-warn' : 'bg-data'}`} />
                    {r.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-[14.5px] text-foreground">Wszystko pod kontrolą. Pilnujemy DNS, SSL, kopii i obciążenia — damy znać, gdy coś będzie wymagać uwagi.</p>
        )}
      </div>
    </section>
  );
}

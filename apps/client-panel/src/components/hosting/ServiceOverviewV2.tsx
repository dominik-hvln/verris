'use client';

/**
 * PB-15 — ekran-wzorzec: widok usługi hostingowej w nowym wyglądzie
 * (docs/design/wzorzec-panelu.html). Tylko realne dane z API; czego API
 * jeszcze nie daje (technologia strony, ruch per domena), tego tu nie ma —
 * lista braków w docs/VERRIS.md („Mapa: obecny panel → nowy design").
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ServiceConnectionInfoDto,
  ServiceDetailsDto,
  ServiceHealthSummaryDto,
  HostingDomainsResponseDto,
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
import { RecommendationsCard } from '@/components/hosting/ServiceOverviewTab';
import { clientFeatures } from '@/lib/client-features';
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
  StackBar,
  StatusPill,
  Switch,
  bucketize,
  comet,
  fmtMb,
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
  const { links } = useHostingLinks();
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
  const [health, setHealth] = useState<ServiceHealthSummaryDto | null>(null);
  const [usage, setUsage] = useState<HostingUsageResponse | null>(null);
  const [conn, setConn] = useState<ServiceConnectionInfoDto | null>(null);
  const [domains, setDomains] = useState<HostingDomainsResponseDto | null>(null);
  const [extras, setExtras] = useState<OverviewExtras | null>(null);
  const [ecoPoints, setEcoPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [asBusy, setAsBusy] = useState(false);

  // Ładowanie stopniowe: nagłówek po samych danych usługi, reszta dociąga się osobno.
  // Wolne źródła (DirectAdmin, sonda zdrowia) nie blokują już całego ekranu.
  const load = useCallback(
    async (forceHealth = false) => {
      const later = <T,>(p: Promise<T>, set: (v: T) => void) => p.then(set).catch(() => undefined);
      void later(fetchHostingUsageAction(serviceId, '24h'), setUsage);
      void later(fetchConnectionInfoAction(serviceId), setConn);
      void later(fetchHostingDomainsAction(serviceId), setDomains);
      void later(fetchOverviewExtrasAction(serviceId), setExtras);
      if (clientFeatures.eco) {
        void later(fetchSidebarUser(), (me) => setEcoPoints(typeof me?.ecoPoints === 'number' ? me.ecoPoints : 0));
      }
      const healthP = later(fetchServiceHealthAction(serviceId, forceHealth), setHealth);
      try {
        const svc = await fetchServiceDetailsAction(serviceId);
        setService(svc);
        setHealth((h) => h ?? svc.health);
      } finally {
        setLoading(false);
      }
      await healthP;
      setRefreshing(false);
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
          label="Procesor · szczyt 24 h"
          value={cpuPeak != null ? Math.round((cpuPeak / cpuLimit) * 100) : '—'}
          unit={cpuPeak != null ? '% limitu' : undefined}
          foot={cpuHot ? <span className="text-warn">blisko limitu — rozważ autoskalowanie</span> : <span>{cpu.values.length ? 'w normie' : 'brak pomiarów z 24 h'}</span>}
        >
          {cpu.values.length ? (
            <MiniBars values={cpu.values} labels={cpu.labels} unit="% CPU (szczyt)" lastTone={cpuHot ? 'warn' : 'data'} format={(v) => String(Math.round(v))} />
          ) : null}
        </Kpi>
        <Kpi
          label="Pamięć RAM · szczyt 24 h"
          value={ram.values.length ? fmtMb(Math.max(...ram.values)).split(' ')[0] : '—'}
          unit={ram.values.length ? `${fmtMb(Math.max(...ram.values)).split(' ')[1]} / ${fmtMb(ramLimit)}` : undefined}
          foot={<span>{ram.values.length ? 'najedź, by zobaczyć godziny' : 'brak pomiarów z 24 h'}</span>}
        >
          {ram.values.length ? <MiniBars values={ram.values} labels={ram.labels} unit="MB (szczyt)" format={(v) => String(Math.round(v))} /> : null}
        </Kpi>
      </KpiStrip>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* Duża kolumna */}
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
                <table className="w-full border-collapse text-sm">
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
                        onClick={() => onNavigate('domains')}
                        onKeyDown={(e) => e.key === 'Enter' && onNavigate('domains')}
                      >
                        <td className="border-t border-line px-3 py-3 font-semibold text-foreground">{d.name}</td>
                        <td className="border-t border-line px-3 py-3 text-muted-foreground">{d.name === primary ? 'domena główna' : 'domena dodatkowa'}</td>
                        <td className="w-8 border-t border-line px-3 py-3 text-muted-foreground">
                          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {!needsBilling && service.status === 'ACTIVE' ? (
            <FirstStepsAssistant health={health} productKind={service.productKind} onNavigate={onNavigate} />
          ) : null}

          <RecommendationsCard recommendations={service.recommendations} serviceId={serviceId} onNavigate={onNavigate} />

          {health ? (
            <section>
              <SectionHead title="Diagnostyka" desc={health.summary} />
              <HealthCheckDetails health={health} serviceId={serviceId} domain={account?.domain ?? null} onNavigate={onNavigate} />
            </section>
          ) : null}

          <DomainPointingPanel serviceId={serviceId} dnsManageUrl={links.dnsUrl} variant="compact" onGoToDomains={() => onNavigate('domains')} />

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
        </div>

        {/* Wąska kolumna */}
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

          {clientFeatures.eco && service.status !== 'CANCELED' && service.status !== 'EXPIRED' ? (
            <EcoModeCard subscriptionId={serviceId} ecoModeEnabled={service.ecoModeEnabled} ecoPoints={ecoPoints} />
          ) : null}

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
        </div>
      </div>
    </div>
  );
}

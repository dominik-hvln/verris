'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Calendar,
  Database,
  ExternalLink,
  FolderOpen,
  Globe,
  Gauge,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ArrowRightLeft,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import type {
  ServiceDetailsDto,
  ServiceHealthSummaryDto,
  ServiceRecommendationDto,
} from '@verris/contracts';
import { Button } from '@verris/ui';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { fetchHostingUsageAction } from '@/app/dashboard/services/[id]/hosting-usage-actions';
import { fetchServiceHealthAction } from '@/app/dashboard/services/[id]/hosting-health-actions';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { ServiceGaugeRing, gaugeColors } from '@/components/hosting/ServiceGaugeRing';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import { HealthCheckDetails } from '@/components/hosting/HealthCheckDetails';
import { FirstStepsAssistant } from '@/components/hosting/FirstStepsAssistant';
import { EcoModeCard } from '@/app/dashboard/services/[id]/autoscaling/eco-mode-card';
import { clientFeatures } from '@/lib/client-features';
import { useModul } from '@/lib/feature-flags';
import { fetchSidebarUser } from '@/app/dashboard/sidebar-actions';
import { liczba } from '@/lib/liczba';
import { powodBlokady } from '@/lib/service-events';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktywna',
  PROVISIONING: 'Tworzenie konta',
  PENDING_PAYMENT: 'Oczekuje płatności',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszona',
  CANCELED: 'Anulowana',
  EXPIRED: 'Wygasła',
};

function healthColor(label: ServiceHealthSummaryDto['label']) {
  if (label === 'healthy') return gaugeColors.emerald;
  if (label === 'attention') return gaugeColors.amber;
  if (label === 'critical') return gaugeColors.rose;
  return 'rgba(255,255,255,0.25)';
}

/** Used value — MB below 1 GB so idle/small accounts are not shown as "0.0 GB". */
function mbToGbUsed(mb: number) {
  if (mb < 1024) {
    return mb < 10 ? `${liczba(mb, 1)} MB` : `${Math.round(mb)} MB`;
  }
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : liczba(gb, 1)} GB`;
}

/** Limit in GB without trailing ".0", e.g. 51200 MB -> "50 GB", 1536 -> "1.5 GB". */
function mbToGbMax(mb: number) {
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : liczba(gb, 1)} GB`;
}

export default function ServiceOverviewTab({
  serviceId,
  onNavigate,
}: {
  serviceId: string;
  onNavigate: (tab: string) => void;
}) {
  // N-12: moduł EKO może wyłączyć operator flagą (brak flagi = jak dotąd).
  const eco = useModul('modul.eco');
  const { links } = useHostingLinks();
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
  const [health, setHealth] = useState<ServiceHealthSummaryDto | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof fetchHostingUsageAction>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ecoPoints, setEcoPoints] = useState<number | null>(null);

  const load = useCallback(
    async (forceHealth = false) => {
      try {
        const [svc, usageRes, healthRes, me] = await Promise.all([
          fetchServiceDetailsAction(serviceId),
          fetchHostingUsageAction(serviceId, '24h').catch(() => null),
          fetchServiceHealthAction(serviceId, forceHealth).catch(() => null),
          clientFeatures.eco
            ? fetchSidebarUser().then((u) => ({ ecoPoints: u ? (u.ecoPoints ?? 0) : null }))
            : Promise.resolve({ ecoPoints: 0 }),
        ]);
        setService(svc);
        setUsage(usageRes);
        setHealth(healthRes ?? svc.health);
        setEcoPoints(me.ecoPoints === null ? null : typeof me.ecoPoints === 'number' ? me.ecoPoints : 0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serviceId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  // Live gauges: silently refetch usage every 45 s (no health re-probe, no spinner).
  useEffect(() => {
    const id = setInterval(() => {
      void fetchHostingUsageAction(serviceId, '24h')
        .then((res) => setUsage(res))
        .catch(() => undefined);
    }, 45_000);
    return () => clearInterval(id);
  }, [serviceId]);

  const latest = usage?.rows.at(-1);
  const account = service?.account;

  const gauges = useMemo(() => {
    if (!account) return null;
    const cpuVal = latest?.cpuUsageAvg ?? 0;
    const ramVal = latest?.memUsageAvgMb ?? 0;
    const diskVal = latest?.diskUsageMb ?? 0;
    return {
      cpu: {
        value: cpuVal,
        max: account.cpuLimit,
        label: 'CPU',
        valueLabel: cpuVal < 10 ? `${liczba(cpuVal, 1)}%` : `${Math.round(cpuVal)}%`,
        sub: `/ ${account.cpuLimit}%`,
      },
      ram: {
        value: ramVal,
        max: account.ramLimitMb,
        label: 'RAM',
        valueLabel: mbToGbUsed(ramVal),
        sub: `/ ${mbToGbMax(account.ramLimitMb)}`,
      },
      disk: {
        value: diskVal,
        max: account.diskLimitMb,
        label: 'Dysk',
        valueLabel: mbToGbUsed(diskVal),
        sub: `/ ${mbToGbMax(account.diskLimitMb)}`,
      },
    };
  }, [account, latest]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie dashboardu…
      </div>
    );
  }

  if (!service) {
    return <p className="text-sm text-crit">Nie udało się wczytać usługi.</p>;
  }

  const periodEnd = service.currentPeriodEnd
    ? new Date(service.currentPeriodEnd).toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const blokada = powodBlokady(service.status, service.events);
  const needsBilling = blokada === 'platnosc';

  // Poczta nie ma hostingu WWW — ukrywamy hostingowe skróty/autoscaling/usage.
  const isEmail = service.productKind === 'EMAIL';

  const showEcoMode =
    eco &&
    service.status !== 'CANCELED' &&
    service.status !== 'EXPIRED';

  return (
    <div className="space-y-4 min-w-0">
      {blokada === 'partner' || blokada === 'obsluga' ? (
        <p className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-foreground">
          <b>{blokada === 'partner' ? 'Usługa wstrzymana przez partnera, który prowadzi Twoje konto.' : 'Usługa wstrzymana przez obsługę Verris.'}</b>{' '}
          <span className="text-muted-foreground">
            {blokada === 'partner'
              ? 'Wznowić ją może partner albo nasza obsługa (kontakt@verris.pl). Szczegóły w Ustawieniach.'
              : 'Aby poznać powód i ustalić wznowienie, otwórz zgłoszenie w Centrum pomocy albo napisz: kontakt@verris.pl.'}
          </span>
        </p>
      ) : null}
      {needsBilling ? (
        <button
          type="button"
          onClick={() => onNavigate('subscription')}
          className="w-full rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-left text-sm text-warn hover:bg-warn-soft transition-colors"
        >
          <span className="font-semibold text-warn">Płatność i subskrypcja</span>
          <span className="mt-1 block text-xs text-warn">
            Opłać, anuluj zamówienie lub zarządzaj rozliczeniem → zakładka Subskrypcja
          </span>
        </button>
      ) : null}

      {showEcoMode ? (
        <EcoModeCard
          subscriptionId={serviceId}
          ecoModeEnabled={service.ecoModeEnabled}
          ecoPoints={ecoPoints}
        />
      ) : null}

      {!needsBilling && service.status === 'ACTIVE' ? (
        <FirstStepsAssistant
          health={health}
          productKind={service.productKind}
          onNavigate={onNavigate}
        />
      ) : null}

      <HostingTabShell
        title={service.plan.name}
        description={account?.domain ?? 'Dashboard usługi hostingowej'}
        icon={<Activity className="h-4 w-4" />}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load(true);
            }}
            className="h-8 gap-1.5 border-line-strong text-foreground text-xs"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Odśwież
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[10px] border border-line bg-raised p-4 flex flex-col items-center justify-center min-h-[120px]">
            {health?.score != null ? (
              <>
                <ServiceGaugeRing
                  label="Health score"
                  value={health.score}
                  max={100}
                  unit=""
                  color={healthColor(health.label)}
                />
                <p className="text-[11px] text-muted-foreground text-center mt-1 px-2 leading-snug">
                  {health.summary}
                </p>
                {health.checkedAt ? (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(health.checkedAt).toLocaleString('pl-PL')}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-[color:var(--verris-body)]">Diagnostyka</p>
                <p className="text-[11px] text-muted-foreground mt-2">{health?.summary ?? 'Oczekiwanie…'}</p>
              </div>
            )}
          </div>

          {gauges ? (
            <>
              <div className="rounded-[10px] border border-line bg-raised p-4 flex items-center justify-center">
                <ServiceGaugeRing
                  label={gauges.cpu.label}
                  value={gauges.cpu.value}
                  max={gauges.cpu.max}
                  valueLabel={gauges.cpu.valueLabel}
                  sub={gauges.cpu.sub}
                  color={gaugeColors.cyan}
                  delayMs={100}
                />
              </div>
              <div className="rounded-[10px] border border-line bg-raised p-4 flex items-center justify-center">
                <ServiceGaugeRing
                  label={gauges.ram.label}
                  value={gauges.ram.value}
                  max={gauges.ram.max}
                  valueLabel={gauges.ram.valueLabel}
                  sub={gauges.ram.sub}
                  color={gaugeColors.violet}
                  delayMs={200}
                />
              </div>
              <div className="rounded-[10px] border border-line bg-raised p-4 flex items-center justify-center">
                <ServiceGaugeRing
                  label={gauges.disk.label}
                  value={gauges.disk.value}
                  max={gauges.disk.max}
                  valueLabel={gauges.disk.valueLabel}
                  sub={gauges.disk.sub}
                  color={gaugeColors.amber}
                  delayMs={300}
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-3 rounded-[10px] border border-line bg-raised p-4 text-xs text-muted-foreground flex items-center">
              Metryki użycia pojawią się w ciągu około godziny po aktywacji usługi.
            </div>
          )}
        </div>

        {health ? (
          <HealthCheckDetails
            health={health}
            serviceId={serviceId}
            domain={account?.domain ?? null}
            onNavigate={onNavigate}
          />
        ) : null}
      </HostingTabShell>

      {/* #19 — rekomendacje (autoscaling / plan / domena / backup) z realnych danych */}
      <RecommendationsCard
        recommendations={service.recommendations}
        serviceId={serviceId}
        onNavigate={onNavigate}
      />

      {/* Karta „kierowania domeny na hosting" (rekord A) dotyczy hostingu WWW.
          Dla poczty konfigurację DNS (MX/SPF/DKIM) prowadzą Pierwsze kroki,
          hint Health Score oraz zakładka Domeny & DNS — bez mylącego rekordu A. */}
      {!isEmail ? (
        <DomainPointingPanel
          serviceId={serviceId}
          variant="compact"
          onGoToDomains={() => onNavigate('domains')}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[10px] border border-line bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Parametry usługi
          </h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-foreground font-medium">{statusLabels[service.status] ?? service.status}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="text-foreground">{service.plan.name}</dd>
            <dt className="text-muted-foreground">Cena</dt>
            <dd className="text-foreground">
              {liczba(Number(service.priceAmount), 2)} {service.currency}
              {service.interval === 'MONTH' ? ' / mies.' : ' / rok'}
            </dd>
            {periodEnd ? (
              <>
                <dt className="text-muted-foreground">Ważność do</dt>
                <dd className="text-foreground">{periodEnd}</dd>
              </>
            ) : null}
            {account?.daUsername ? (
              <>
                <dt className="text-muted-foreground">Login hostingu</dt>
                <dd className="text-foreground font-mono text-[11px]">{account.daUsername}</dd>
              </>
            ) : null}
            {eco ? (
              <>
                <dt className="text-muted-foreground">Tryb EKO</dt>
                <dd className={service.ecoModeEnabled ? 'text-data-hi font-medium' : 'text-muted-foreground'}>
                  {service.ecoModeEnabled ? 'Włączony' : 'Wyłączony'}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/dashboard/services/${serviceId}/plan`}
              className="inline-flex items-center gap-1 rounded-[7px] border border-line px-2.5 py-1.5 text-[11px] text-[color:var(--verris-body)] hover:bg-raised"
            >
              <ArrowRightLeft className="h-3 w-3" />
              Zmiana planu
            </Link>
            {!isEmail ? (
              <Link
                href={`/dashboard/services/${serviceId}/autoscaling`}
                className="inline-flex items-center gap-1 rounded-[7px] border border-line px-2.5 py-1.5 text-[11px] text-[color:var(--verris-body)] hover:bg-raised"
              >
                <Gauge className="h-3 w-3" />
                Autoscaling
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-[10px] border border-line bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Skróty</h3>
          <div className="grid grid-cols-2 gap-2">
            {links.domainsUrl ? (
              <a
                href={links.domainsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
              >
                <Globe className="h-3.5 w-3.5" />
                Domeny
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Globe} label="Domeny" onClick={() => onNavigate('domains')} />
            )}
            {!isEmail ? (
              links.databasesUrl ? (
                <a
                  href={links.databasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
                >
                  <Database className="h-3.5 w-3.5" />
                  Bazy MySQL
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              ) : (
                <ShortcutButton icon={Database} label="Bazy" onClick={() => onNavigate('databases')} />
              )
            ) : null}
            {!isEmail ? (
              links.fileManagerUrl ? (
                <a
                  href={links.fileManagerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Pliki
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              ) : (
                <ShortcutButton icon={FolderOpen} label="Pliki" onClick={() => onNavigate('files')} />
              )
            ) : null}
            {links.emailUrl ? (
              <a
                href={links.emailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
              >
                <Mail className="h-3.5 w-3.5" />
                Poczta (panel)
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Mail} label="Poczta" onClick={() => onNavigate('mail')} />
            )}
            {!isEmail ? (
              links.sslUrl ? (
                <a
                  href={links.sslUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
                >
                  <Shield className="h-3.5 w-3.5" />
                  SSL
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              ) : (
                <ShortcutButton icon={Shield} label="SSL" onClick={() => onNavigate('ssl')} />
              )
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onNavigate(isEmail ? 'backups' : 'usage')}
            className="w-full text-left rounded-[7px] border border-line px-3 py-2 text-[11px] text-muted-foreground hover:bg-raised hover:text-foreground"
          >
            {isEmail ? 'Kopie zapasowe →' : 'Usage, backup i badge uptime →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** #19 — karta rekomendacji/upsell z realnych danych usługi. */
export function RecommendationsCard({
  recommendations,
  serviceId,
  onNavigate,
}: {
  recommendations: ServiceRecommendationDto[];
  serviceId: string;
  onNavigate: (tab: string) => void;
}) {
  // Pomijamy „wszystko gra" filler (type plan + severity info + tytuł o poprawnym
  // działaniu) — pokazujemy tylko realnie actionable rekomendacje.
  const items = recommendations.filter(
    (r) => !(r.severity === 'info' && r.title.startsWith('Usługa działa')),
  );
  if (items.length === 0) return null;

  const tone: Record<ServiceRecommendationDto['severity'], string> = {
    critical: 'border-crit/30 bg-crit/12',
    warning: 'border-warn/30 bg-warn-soft',
    info: 'border-data/28 bg-data-soft',
  };

  const cta = (r: ServiceRecommendationDto): { label: string; href?: string; tab?: string } => {
    switch (r.type) {
      case 'plan':
        return { label: 'Zobacz plany', href: `/dashboard/services/${serviceId}/plan` };
      case 'autoscaling':
        return { label: 'Ustaw autoscaling', href: `/dashboard/services/${serviceId}/autoscaling` };
      case 'backup':
        return { label: 'Przejdź do kopii', tab: 'backups' };
      case 'domain':
      default:
        return { label: 'Sprawdź domenę i DNS', tab: 'domains' };
    }
  };

  return (
    <div className="rounded-[10px] border border-line bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-warn" />
        Rekomendacje
      </h3>
      <div className="space-y-2">
        {items.map((r, i) => {
          const c = cta(r);
          return (
            <div
              key={`${r.type}-${i}`}
              className={`flex items-start justify-between gap-3 rounded-[10px] border p-3 ${tone[r.severity]}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{r.title}</p>
                <p className="text-xs text-[color:var(--verris-body)] mt-0.5">{r.body}</p>
              </div>
              {c.href ? (
                <Link
                  href={c.href}
                  className="shrink-0 inline-flex items-center gap-1 rounded-[7px] border border-line-strong bg-raised px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-raised"
                >
                  {c.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(c.tab!)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-[7px] border border-line-strong bg-raised px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-raised"
                >
                  {c.label}
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShortcutButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-raised"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

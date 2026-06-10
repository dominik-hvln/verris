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
} from 'lucide-react';
import type { ServiceDetailsDto, ServiceHealthSummaryDto } from '@verris/contracts';
import { Button } from '@verris/ui';
import { fetchServiceDetailsAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { fetchHostingUsageAction } from '@/app/dashboard/services/[id]/hosting-usage-actions';
import { fetchServiceHealthAction } from '@/app/dashboard/services/[id]/hosting-health-actions';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { ServiceGaugeRing, gaugeColors } from '@/components/hosting/ServiceGaugeRing';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import DomainPointingPanel from '@/components/hosting/DomainPointingPanel';
import { HealthCheckDetails } from '@/components/hosting/HealthCheckDetails';
import { EcoModeCard } from '@/app/dashboard/services/[id]/autoscaling/eco-mode-card';
import { clientFeatures } from '@/lib/client-features';
import { apiFetch } from '@/lib/api';

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

/** Used value in GB with 1-decimal (0.1) precision, e.g. 1536 MB -> "1.5 GB". */
function mbToGbUsed(mb: number) {
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Limit in GB without trailing ".0", e.g. 51200 MB -> "50 GB", 1536 -> "1.5 GB". */
function mbToGbMax(mb: number) {
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

export default function ServiceOverviewTab({
  serviceId,
  onNavigate,
}: {
  serviceId: string;
  onNavigate: (tab: string) => void;
}) {
  const { links } = useHostingLinks();
  const [service, setService] = useState<ServiceDetailsDto | null>(null);
  const [health, setHealth] = useState<ServiceHealthSummaryDto | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof fetchHostingUsageAction>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ecoPoints, setEcoPoints] = useState(0);

  const load = useCallback(
    async (forceHealth = false) => {
      try {
        const [svc, usageRes, healthRes, me] = await Promise.all([
          fetchServiceDetailsAction(serviceId),
          fetchHostingUsageAction(serviceId, '24h').catch(() => null),
          fetchServiceHealthAction(serviceId, forceHealth).catch(() => null),
          clientFeatures.eco
            ? apiFetch<{ ecoPoints?: number }>('/users/me').catch(() => ({ ecoPoints: 0 }))
            : Promise.resolve({ ecoPoints: 0 }),
        ]);
        setService(svc);
        setUsage(usageRes);
        setHealth(healthRes ?? svc.health);
        setEcoPoints(typeof me.ecoPoints === 'number' ? me.ecoPoints : 0);
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
        valueLabel: `${Math.round(cpuVal)}%`,
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
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie dashboardu…
      </div>
    );
  }

  if (!service) {
    return <p className="text-sm text-rose-200">Nie udało się wczytać usługi.</p>;
  }

  const periodEnd = service.currentPeriodEnd
    ? new Date(service.currentPeriodEnd).toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const needsBilling =
    service.status === 'PENDING_PAYMENT' ||
    service.status === 'PAST_DUE' ||
    service.status === 'SUSPENDED';

  const showEcoMode =
    clientFeatures.eco &&
    service.status !== 'CANCELED' &&
    service.status !== 'EXPIRED';

  return (
    <div className="space-y-4 min-w-0">
      {needsBilling ? (
        <button
          type="button"
          onClick={() => onNavigate('subscription')}
          className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100 hover:bg-amber-500/15 transition-colors"
        >
          <span className="font-semibold text-amber-50">Płatność i subskrypcja</span>
          <span className="mt-1 block text-xs text-amber-100/80">
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
            className="h-8 gap-1.5 border-white/15 text-white text-xs"
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col items-center justify-center min-h-[120px]">
            {health?.score != null ? (
              <>
                <ServiceGaugeRing
                  label="Health score"
                  value={health.score}
                  max={100}
                  unit=""
                  color={healthColor(health.label)}
                />
                <p className="text-[11px] text-neutral-400 text-center mt-1 px-2 leading-snug">
                  {health.summary}
                </p>
                {health.checkedAt ? (
                  <p className="text-[10px] text-neutral-600 mt-1">
                    {new Date(health.checkedAt).toLocaleString('pl-PL')}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-300">Diagnostyka</p>
                <p className="text-[11px] text-neutral-500 mt-2">{health?.summary ?? 'Oczekiwanie…'}</p>
              </div>
            )}
          </div>

          {gauges ? (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-center">
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
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-center">
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
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-center">
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
            <div className="sm:col-span-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-neutral-500 flex items-center">
              Metryki użycia pojawią się w ciągu około godziny po aktywacji usługi.
            </div>
          )}
        </div>

        {health ? <HealthCheckDetails health={health} /> : null}
      </HostingTabShell>

      <DomainPointingPanel
        serviceId={serviceId}
        dnsManageUrl={links.dnsUrl}
        variant="compact"
        onGoToDomains={() => onNavigate('domains')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Parametry usługi
          </h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-neutral-500">Status</dt>
            <dd className="text-white font-medium">{statusLabels[service.status] ?? service.status}</dd>
            <dt className="text-neutral-500">Plan</dt>
            <dd className="text-white">{service.plan.name}</dd>
            <dt className="text-neutral-500">Cena</dt>
            <dd className="text-white">
              {Number(service.priceAmount).toFixed(2)} {service.currency}
              {service.interval === 'MONTH' ? ' / mies.' : ' / rok'}
            </dd>
            {periodEnd ? (
              <>
                <dt className="text-neutral-500">Ważność do</dt>
                <dd className="text-white">{periodEnd}</dd>
              </>
            ) : null}
            {account?.daUsername ? (
              <>
                <dt className="text-neutral-500">Login hostingu</dt>
                <dd className="text-white font-mono text-[11px]">{account.daUsername}</dd>
              </>
            ) : null}
            {clientFeatures.eco ? (
              <>
                <dt className="text-neutral-500">Tryb EKO</dt>
                <dd className={service.ecoModeEnabled ? 'text-emerald-400 font-medium' : 'text-neutral-400'}>
                  {service.ecoModeEnabled ? 'Włączony' : 'Wyłączony'}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/dashboard/services/${serviceId}/plan`}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:bg-white/5"
            >
              <ArrowRightLeft className="h-3 w-3" />
              Zmiana planu
            </Link>
            <Link
              href={`/dashboard/services/${serviceId}/autoscaling`}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:bg-white/5"
            >
              <Gauge className="h-3 w-3" />
              Autoscaling
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">Skróty</h3>
          <div className="grid grid-cols-2 gap-2">
            {links.domainsUrl ? (
              <a
                href={links.domainsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                <Globe className="h-3.5 w-3.5" />
                Domeny
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Globe} label="Domeny" onClick={() => onNavigate('domains')} />
            )}
            {links.databasesUrl ? (
              <a
                href={links.databasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                <Database className="h-3.5 w-3.5" />
                Bazy MySQL
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Database} label="Bazy" onClick={() => onNavigate('databases')} />
            )}
            {links.fileManagerUrl ? (
              <a
                href={links.fileManagerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Pliki
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={FolderOpen} label="Pliki" onClick={() => onNavigate('files')} />
            )}
            {links.emailUrl ? (
              <a
                href={links.emailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                <Mail className="h-3.5 w-3.5" />
                Poczta (panel)
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Mail} label="Poczta" onClick={() => onNavigate('mail')} />
            )}
            {links.sslUrl ? (
              <a
                href={links.sslUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                <Shield className="h-3.5 w-3.5" />
                SSL
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ) : (
              <ShortcutButton icon={Shield} label="SSL" onClick={() => onNavigate('ssl')} />
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('usage')}
            className="w-full text-left rounded-lg border border-white/10 px-3 py-2 text-[11px] text-neutral-400 hover:bg-white/5 hover:text-white"
          >
            Usage, backup i badge uptime →
          </button>
        </div>
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

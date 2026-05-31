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

function CheckPill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
        ok
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
          : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
      }`}
    >
      {label}: {ok ? 'OK' : 'Uwaga'}
    </span>
  );
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

  const load = useCallback(
    async (forceHealth = false) => {
      try {
        const [svc, usageRes, healthRes] = await Promise.all([
          fetchServiceDetailsAction(serviceId),
          fetchHostingUsageAction(serviceId, '24h').catch(() => null),
          fetchServiceHealthAction(serviceId, forceHealth).catch(() => null),
        ]);
        setService(svc);
        setUsage(usageRes);
        setHealth(healthRes ?? svc.health);
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
      cpu: { value: cpuVal, max: account.cpuLimit, label: 'CPU' },
      ram: { value: ramVal, max: account.ramLimitMb, label: 'RAM', unit: ' MB' as const },
      disk: {
        value: diskVal,
        max: account.diskLimitMb,
        label: 'Dysk',
        unit: ' MB' as const,
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

  return (
    <div className="space-y-4 min-w-0">
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
                  color={gaugeColors.cyan}
                  delayMs={100}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-center">
                <ServiceGaugeRing
                  label={gauges.ram.label}
                  value={gauges.ram.value}
                  max={gauges.ram.max}
                  unit={gauges.ram.unit}
                  color={gaugeColors.violet}
                  delayMs={200}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-center">
                <ServiceGaugeRing
                  label={gauges.disk.label}
                  value={gauges.disk.value}
                  max={gauges.disk.max}
                  unit={gauges.disk.unit}
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

        {health ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <CheckPill ok={health.checks.dnsOk} label="DNS" />
            <CheckPill ok={health.checks.tlsOk} label="HTTPS" />
            <CheckPill ok={health.checks.phpOk} label="Panel hostingu" />
            <CheckPill ok={health.checks.lveOk} label="Obciążenie CPU" />
          </div>
        ) : null}
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

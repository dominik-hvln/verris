import {
  Server,
  Settings2,
  ShieldAlert,
  HardDrive,
  Globe,
  Plus,
  Gauge,
  ArrowRightLeft,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeaderRow } from '@/components/panel';
import type {
  ProvisioningProgressDto,
  ServiceSummaryDto,
  SubscriptionStatus,
} from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { UnpaidServiceBanner } from '@/components/hosting/UnpaidServiceBanner';
import { listServices } from './data';

const statusLabels: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: 'Oczekuje płatności',
  PROVISIONING: 'Tworzenie konta',
  ACTIVE: 'Aktywna',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszona',
  CANCELED: 'Anulowana',
  EXPIRED: 'Wygasła',
};

const statusBadgeClass: Record<SubscriptionStatus, string> = {
  ACTIVE: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  PROVISIONING: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
  PENDING_PAYMENT: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  PAST_DUE: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  SUSPENDED: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  CANCELED: 'border-white/20 bg-white/5 text-neutral-300',
  EXPIRED: 'border-white/20 bg-white/5 text-neutral-300',
};

export default async function ServicesPage() {
  let services: ServiceSummaryDto[] = [];
  let loadError: string | null = null;

  try {
    services = await listServices();
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Nie udało się pobrać Twoich usług (${err.status}).`
        : err instanceof Error
          ? err.message
          : 'Nieznany błąd';
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeaderRow
        title="Twoje usługi"
        description="Zarządzaj pakietami hostingowymi i serwerami."
        actions={
          <Link
            href="/dashboard/services/new"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition-all hover:bg-neutral-200 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Zamów nową usługę
          </Link>
        }
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-6 text-rose-200 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">Wystąpił problem</p>
            <p className="text-sm text-rose-200/80 mt-1">{loadError}</p>
          </div>
        </div>
      ) : services.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceSummaryDto }) {
  const account = service.account;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] hover:bg-[#0d0d0d] transition-colors duration-200">
      <div className="p-5 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-white">
            <Server className="h-6 w-6" />
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              statusBadgeClass[service.status]
            }`}
          >
            {statusLabels[service.status]}
          </span>
        </div>

        <UnpaidServiceBanner
          serviceId={service.id}
          status={service.status}
          paymentSource={service.paymentSource}
        />

        {service.provisioning && service.status !== 'ACTIVE' && (
          <ProvisioningBadge progress={service.provisioning} />
        )}

        <div className="mb-4 min-w-0">
          <h3 className="text-lg font-bold text-white leading-tight truncate">{service.planName}</h3>
          <div className="mt-2 space-y-1 text-xs text-neutral-400">
            <span className="flex items-center gap-2 min-w-0">
              <Globe className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span className="truncate">{account?.domain ?? '—'}</span>
            </span>
            {account?.server?.name ? (
              <span className="flex items-center gap-2 min-w-0">
                <HardDrive className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="truncate">{account.server.name}</span>
              </span>
            ) : null}
          </div>
        </div>

        {service.recommendations[0] && service.recommendations[0].severity !== 'info' ? (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
            <span className="font-semibold">{service.recommendations[0].title}</span>
            {' — '}
            {service.recommendations[0].body}
          </div>
        ) : service.health.score != null ? (
          <div className="mb-4 flex items-center gap-2 text-xs">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                service.health.label === 'healthy'
                  ? 'bg-emerald-400'
                  : service.health.label === 'attention'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
              }`}
            />
            <span className="text-neutral-400">
              Health{' '}
              <span className="text-white font-semibold">{service.health.score}/100</span>
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <ResourceTile label="CPU" value={`${account?.cpuLimit ?? 0}%`} />
          <ResourceTile
            label="RAM"
            value={account ? `${(account.ramLimitMb / 1024).toFixed(1)} GB` : '—'}
          />
          <ResourceTile
            label="Dysk"
            value={account ? `${(account.diskLimitMb / 1024).toFixed(0)} GB` : '—'}
          />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-white/5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-neutral-500">
            <span className="text-white font-medium">
              {Number(service.priceAmount).toFixed(2)} {service.currency}
            </span>
            {service.interval === 'MONTH' ? ' / mies.' : ' / rok'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {service.status === 'ACTIVE' && account ? (
              <Link href={`/dashboard/services/${service.id}/plan`}>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg p-2 text-sm border border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20"
                  title="Zmiana planu"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </button>
              </Link>
            ) : null}
            <Link href={`/dashboard/services/${service.id}/autoscaling`}>
              <button
                type="button"
                className={`inline-flex items-center justify-center rounded-lg p-2 text-sm border transition-colors ${
                  service.autoscalingEnabled
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20'
                    : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                }`}
                title="Autoskalowanie"
              >
                <Gauge className="h-4 w-4" />
              </button>
            </Link>
            <Link href={`/dashboard/services/${service.id}`}>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white px-3 py-2 text-xs font-semibold transition-colors">
                <Settings2 className="h-3.5 w-3.5" />
                Zarządzaj
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvisioningBadge({ progress }: { progress: ProvisioningProgressDto }) {
  const stageLabels: Record<ProvisioningProgressDto['stage'], string> = {
    queued: 'W kolejce',
    running: 'Tworzenie konta',
    retrying: 'Powtarzamy próbę',
    failed: 'Błąd konfiguracji',
    completed: 'Gotowe',
  };
  const stageStyles: Record<ProvisioningProgressDto['stage'], string> = {
    queued: 'border-sky-400/30 bg-sky-400/5 text-sky-200',
    running: 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200 animate-pulse',
    retrying: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    failed: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
    completed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  };
  return (
    <div
      className={`mb-6 rounded-2xl border px-4 py-3 text-xs ${stageStyles[progress.stage]}`}
    >
      <div className="font-semibold uppercase tracking-widest">
        <span>{stageLabels[progress.stage]}</span>
      </div>
      {progress.stage === 'failed' ? (
        <p className="mt-2 text-[11px] leading-snug opacity-90">
          Wystąpił problem podczas konfiguracji. Skontaktuj się z pomocą techniczną — zajmiemy się tym
          priorytetowo.
        </p>
      ) : null}
    </div>
  );
}

function ResourceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
      <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white truncate">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-border bg-card/30 p-12 text-center">
      <div
        aria-hidden
        className="verris-pattern-bg pointer-events-none absolute inset-0 opacity-[0.06]"
      />
      <Server className="relative z-10 mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="relative z-10 mt-6 font-display text-2xl font-bold text-foreground">
        Nie masz jeszcze żadnej usługi
      </h3>
      <p className="relative z-10 mx-auto mt-2 max-w-md text-muted-foreground">
        Wybierz plan dopasowany do potrzeb Twojej strony — utworzymy konto na serwerze w ciągu kilku
        sekund.
      </p>
      <Link
        href="/dashboard/services/new"
        className="relative z-10 mt-8 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-verris-tip"
      >
        <Plus className="h-4 w-4" />
        Wybierz plan
      </Link>
    </div>
  );
}

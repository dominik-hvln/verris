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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const badgeUrl = `${apiUrl}/public/services/${service.id}/uptime-badge.svg`;
  return (
    <div className="group relative overflow-hidden rounded-[32px] p-px hover:-translate-y-1 transition-transform duration-300">
      <div className="relative h-full w-full bg-[#0a0a0a] group-hover:bg-[#121212] transition-colors duration-300 rounded-[32px] p-6 md:p-8 flex flex-col justify-between z-10 border border-white/5">
        <div>
          <div className="flex items-start justify-between mb-6">
            <div className="p-4 rounded-[20px] bg-white/5 border border-white/10 text-white transition-all duration-300 group-hover:bg-white/10 group-hover:scale-105">
              <Server className="h-8 w-8" />
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                statusBadgeClass[service.status]
              }`}
            >
              {statusLabels[service.status]}
            </span>
          </div>

          {service.provisioning && service.status !== 'ACTIVE' && (
            <ProvisioningBadge progress={service.provisioning} />
          )}

          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Health Score
              </span>
              <span
                className={`text-sm font-bold ${
                  service.health.label === 'healthy'
                    ? 'text-emerald-300'
                    : service.health.label === 'attention'
                      ? 'text-amber-300'
                      : 'text-rose-300'
                }`}
              >
                {service.health.score}/100
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/10">
              <div
                className={`h-2 rounded-full ${
                  service.health.label === 'healthy'
                    ? 'bg-emerald-400'
                    : service.health.label === 'attention'
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                }`}
                style={{ width: `${Math.max(5, Math.min(100, service.health.score))}%` }}
              />
            </div>
            {service.recommendations[0] && (
              <p className="mt-3 text-xs text-neutral-300">
                <span className="font-semibold text-white">{service.recommendations[0].title}</span>
                {" — "}
                {service.recommendations[0].body}
              </p>
            )}
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-white leading-tight mb-2">
              {service.planName}
            </h3>
            <div className="flex flex-col gap-1 text-sm text-neutral-400">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-neutral-500" />
                {account?.domain ?? '—'}
              </span>
              <span className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-neutral-500" />
                {account?.daUsername ? `login hostingowy: ${account.daUsername}` : 'brak konta hostingowego'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <ResourceTile label="CPU" value={`${account?.cpuLimit ?? 0}%`} />
            <ResourceTile
              label="RAM"
              value={
                account ? `${(account.ramLimitMb / 1024).toFixed(1)} GB` : '—'
              }
            />
            <ResourceTile
              label="Dysk"
              value={
                account ? `${(account.diskLimitMb / 1024).toFixed(0)} GB` : '—'
              }
            />
          </div>
          {account ? (
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Publiczny uptime badge
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <img src={badgeUrl} alt="Publiczny uptime badge" className="h-6" />
                <code className="break-all rounded-lg bg-black/30 px-2 py-1 text-[11px] text-neutral-300">
                  {badgeUrl}
                </code>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-between items-center pt-6 border-t border-white/5 text-sm mt-4">
          <span className="text-neutral-500">
            Cena:&nbsp;
            <span className="text-white font-medium">
              {Number(service.priceAmount).toFixed(2)} {service.currency}
              {service.interval === 'MONTH' ? ' / mies.' : ' / rok'}
            </span>
          </span>
          <div className="flex items-center gap-2">
            {service.status === 'ACTIVE' && account ? (
              <Link href={`/dashboard/services/${service.id}/plan`}>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20 transition-colors"
                  title="Zmiana planu"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </button>
              </Link>
            ) : null}
            <Link href={`/dashboard/services/${service.id}/autoscaling`}>
              <button
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border transition-colors ${
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
              <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 font-medium transition-colors">
                <Settings2 className="h-4 w-4" />
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
      <div className="flex items-center justify-between font-semibold uppercase tracking-widest">
        <span>{stageLabels[progress.stage]}</span>
        <span className="text-[10px] opacity-70">próba {progress.attempts || 1}</span>
      </div>
      {progress.lastError && progress.stage !== 'completed' && (
        <p className="mt-2 text-[11px] leading-snug opacity-90">{progress.lastError}</p>
      )}
    </div>
  );
}

function ResourceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[32px] border border-white/10 bg-white/[0.02] p-12 text-center">
      <Server className="h-12 w-12 mx-auto text-neutral-500" />
      <h3 className="mt-6 text-2xl font-bold text-white">Nie masz jeszcze żadnej usługi</h3>
      <p className="mt-2 text-neutral-400 max-w-md mx-auto">
        Wybierz plan dopasowany do potrzeb Twojej strony — utworzymy konto na serwerze w ciągu kilku
        sekund.
      </p>
      <Link
        href="/dashboard/services/new"
        className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black hover:bg-neutral-200"
      >
        <Plus className="h-4 w-4" />
        Wybierz plan
      </Link>
    </div>
  );
}

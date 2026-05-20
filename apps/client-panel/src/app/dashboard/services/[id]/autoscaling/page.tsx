import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  Calculator,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
} from 'lucide-react';
import { getAutoscalingHistory, getServiceDetails, getUserEcoPoints } from './data';
import { AutoscalingForm } from './form';
import { AutoscalingTimeline } from './timeline';
import { EcoModeCard } from './eco-mode-card';

export const dynamic = 'force-dynamic';

export default async function AutoscalingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [serviceResult, historyResult, ecoPoints] = await Promise.all([
    getServiceDetails(id),
    getAutoscalingHistory(id),
    getUserEcoPoints(),
  ]);

  if (!serviceResult.ok) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <Link
          href="/dashboard/services"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do usług
        </Link>
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100 flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold">Nie można wczytać tej usługi</p>
            <p className="text-sm text-rose-200/80 mt-1">{serviceResult.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const service = serviceResult.data;
  const history = historyResult.ok ? historyResult.data : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/services/${id}`}
          className="p-3 border border-white/5 rounded-2xl bg-[#0a0a0a] hover:bg-[#121212] transition-colors text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white flex items-center gap-3">
            <Gauge className="w-8 h-8 text-emerald-400" />
            Autoskalowanie
          </h1>
          <p className="text-neutral-400 mt-2 text-md">
            Plan <span className="text-white font-semibold">{service.plan.name}</span>
            {service.account?.domain && (
              <>
                {' '}
                · domena{' '}
                <span className="text-white font-mono">{service.account.domain}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <EcoModeCard
        subscriptionId={service.id}
        ecoModeEnabled={service.ecoModeEnabled}
        ecoPoints={ecoPoints}
      />

      {service.account ? (
        <>
          <CurrentLimitsCard plan={service.plan} account={service.account} />
          <div className="flex justify-end">
            <Link
              href={calculatorPrefillHref(service.account)}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20 transition-colors"
            >
              <Calculator className="h-4 w-4" />
              Szacuj koszt z aktualnej delty
            </Link>
          </div>
        </>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <AutoscalingForm
          subscriptionId={service.id}
          enabled={service.autoscalingEnabled}
          maxMonthlyCost={Number(service.autoscalingMaxCost)}
          scaleCpu={service.autoscalingScaleCpu ?? true}
          scaleRam={service.autoscalingScaleRam ?? true}
          scaleDisk={service.autoscalingScaleDisk ?? true}
        />

        <SpendCard
          last30dSpend={history?.last30dSpend ?? '0.00'}
          currency={history?.currency ?? service.currency}
          maxCap={Number(service.autoscalingMaxCost)}
          enabled={service.autoscalingEnabled}
        />
      </div>

      {historyResult.ok ? (
        <AutoscalingTimeline events={history!.events} charges={history!.charges} />
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Nie udało się pobrać historii autoskalowania: {historyResult.error}
        </div>
      )}
    </div>
  );
}

function CurrentLimitsCard({
  plan,
  account,
}: {
  plan: {
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
  };
  account: {
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
    scaledCpu: number;
    scaledRamMb: number;
    scaledDiskMb: number;
  };
}) {
  const tiles = [
    {
      label: 'CPU',
      icon: Cpu,
      planValue: `${plan.cpuLimit}%`,
      current: `${account.cpuLimit}%`,
      delta:
        account.scaledCpu > 0 ? `autoskalowanie +${account.scaledCpu}%` : null,
    },
    {
      label: 'RAM',
      icon: MemoryStick,
      planValue: formatMbAsGb(plan.ramLimitMb),
      current: formatMbAsGb(account.ramLimitMb),
      delta:
        account.scaledRamMb > 0
          ? `autoskalowanie +${formatMbAsGb(account.scaledRamMb)}`
          : null,
    },
    {
      label: 'Dysk',
      icon: HardDrive,
      planValue: formatMbAsGb(plan.diskLimitMb),
      current: formatMbAsGb(account.diskLimitMb),
      delta:
        account.scaledDiskMb > 0
          ? `autoskalowanie +${formatMbAsGb(account.scaledDiskMb)}`
          : null,
    },
  ];

  return (
    <section className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
      <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">
        Aktualne limity zasobów
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        Wartości efektywne na koncie hostingowym (plan + ewentualna delta autoskalowania).
      </p>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
          >
            <div className="flex items-center gap-2 text-neutral-500 text-xs font-bold uppercase tracking-wider">
              <tile.icon className="h-4 w-4" />
              {tile.label}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-white">{tile.current}</div>
            <div className="mt-1 text-[11px] text-neutral-500">
              Plan: {tile.planValue}
            </div>
            {tile.delta ? (
              <div className="mt-2 text-[11px] font-semibold text-emerald-400/90">
                {tile.delta}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function calculatorPrefillHref(account: {
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
}): string {
  const params = new URLSearchParams();
  if (account.scaledCpu > 0) params.set('cpu', String(account.scaledCpu));
  const ramGb = account.scaledRamMb / 1024;
  if (ramGb > 0) params.set('ramGb', String(Math.round(ramGb * 2) / 2));
  const diskGb = account.scaledDiskMb / 1024;
  if (diskGb > 0) params.set('diskGb', String(Math.round(diskGb)));
  const q = params.toString();
  return q ? `/dashboard/calculator?${q}` : '/dashboard/calculator';
}

function formatMbAsGb(mb: number): string {
  const gb = mb / 1024;
  return gb % 1 === 0 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

function SpendCard({
  last30dSpend,
  currency,
  maxCap,
  enabled,
}: {
  last30dSpend: string;
  currency: string;
  maxCap: number;
  enabled: boolean;
}) {
  const spend = Number.parseFloat(last30dSpend);
  const capProgress =
    maxCap > 0 ? Math.min(100, Math.round((spend / maxCap) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6 flex flex-col">
      <div className="text-xs uppercase tracking-widest text-neutral-500 font-bold">
        Koszt autoskalowania (30 dni)
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold text-white">{spend.toFixed(2)}</span>
        <span className="text-neutral-400 font-semibold">{currency}</span>
      </div>

      {maxCap > 0 ? (
        <>
          <div className="mt-5">
            <div className="flex justify-between text-xs text-neutral-400 mb-1.5">
              <span>Limit miesięczny</span>
              <span className="text-white font-semibold">
                {maxCap.toFixed(2)} {currency}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capProgress >= 90
                    ? 'bg-rose-500'
                    : capProgress >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${capProgress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Po przekroczeniu limitu silnik autoskalowania nie zwiększy zasobów aż do
              końca miesiąca lub podniesienia limitu.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm text-neutral-400">
          {enabled
            ? 'Brak miesięcznego limitu — koszty są naliczane bez ograniczenia.'
            : 'Autoskalowanie jest wyłączone — brak naliczeń.'}
        </p>
      )}
    </div>
  );
}

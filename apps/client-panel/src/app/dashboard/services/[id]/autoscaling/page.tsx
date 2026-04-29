import Link from 'next/link';
import { ArrowLeft, AlertCircle, Gauge } from 'lucide-react';
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <AutoscalingForm
          subscriptionId={service.id}
          enabled={service.autoscalingEnabled}
          maxMonthlyCost={Number(service.autoscalingMaxCost)}
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

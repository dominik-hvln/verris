import Link from 'next/link';
import { ArrowLeft, AlertCircle, Calculator } from 'lucide-react';
import { PanelPageHeader } from '@/components/panel';
import { Kpi, KpiStrip, Meter } from '@/components/panel/v2';
import { getAutoscalingHistory, getEcoReport, getServiceDetails, getUserEcoPoints } from './data';
import { AutoscalingForm } from './form';
import { AutoscalingTimeline } from './timeline';
import { EcoModeCard } from './eco-mode-card';
import { EcoReportCard } from './eco-report-card';
import { liczba } from '@/lib/liczba';

export const dynamic = 'force-dynamic';

export default async function AutoscalingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [serviceResult, historyResult, ecoPoints, ecoReport] = await Promise.all([
    getServiceDetails(id),
    getAutoscalingHistory(id),
    getUserEcoPoints(),
    getEcoReport(id),
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

  const spend = Number.parseFloat(history?.last30dSpend ?? '0');
  const cap = Number(service.autoscalingMaxCost);
  const currency = history?.currency ?? service.currency;
  const capPct = cap > 0 ? Math.min(100, (spend / cap) * 100) : 0;
  const acc = service.account;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
        <Link href="/dashboard/services" className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Usługi
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/dashboard/services/${id}`} className="rounded px-1 py-0.5 hover:bg-raised hover:text-foreground">
          {service.plan.name}
        </Link>
        <span aria-hidden>/</span>
        <b className="font-semibold text-foreground">Autoskalowanie i EKO</b>
      </div>

      <PanelPageHeader
        title="Autoskalowanie i EKO"
        description={`Gdy strona potrzebuje więcej mocy, dokładamy zasoby ponad plan i naliczamy je z portfela — nigdy powyżej bezpiecznika.${acc?.domain ? ` Konto: ${acc.domain}.` : ''}`}
      />

      <KpiStrip>
        {acc ? (
          <>
            <Kpi
              label="CPU teraz"
              value={acc.cpuLimit}
              unit="%"
              foot={<span>plan {service.plan.cpuLimit}%{acc.scaledCpu > 0 ? ` · +${acc.scaledCpu}% z autoskalowania` : ''}</span>}
            />
            <Kpi
              label="RAM teraz"
              value={formatMbAsGb(acc.ramLimitMb)}
              foot={<span>plan {formatMbAsGb(service.plan.ramLimitMb)}{acc.scaledRamMb > 0 ? ` · +${formatMbAsGb(acc.scaledRamMb)}` : ''}</span>}
            />
            <Kpi
              label="Dysk teraz"
              value={formatMbAsGb(acc.diskLimitMb)}
              foot={<span>plan {formatMbAsGb(service.plan.diskLimitMb)}{acc.scaledDiskMb > 0 ? ` · +${formatMbAsGb(acc.scaledDiskMb)}` : ''}</span>}
            />
          </>
        ) : null}
        <Kpi
          label="Koszt · 30 dni"
          value={spend.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
          unit={currency === 'PLN' ? 'zł' : currency}
          foot={<span>{cap > 0 ? `bezpiecznik ${cap.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł / 30 dni` : service.autoscalingEnabled ? 'bez bezpiecznika' : 'autoskalowanie wyłączone'}</span>}
        >
          {cap > 0 ? <Meter pct={capPct} tone={capPct >= 90 ? 'warn' : 'data'} tipText={`${Math.round(capPct)}% bezpiecznika\n${liczba(spend, 2)} z ${liczba(cap, 2)} zł`} /> : null}
        </Kpi>
      </KpiStrip>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <AutoscalingForm
            subscriptionId={service.id}
            enabled={service.autoscalingEnabled}
            maxMonthlyCost={Number(service.autoscalingMaxCost)}
            scaleCpu={service.autoscalingScaleCpu ?? true}
            scaleRam={service.autoscalingScaleRam ?? true}
            scaleDisk={service.autoscalingScaleDisk ?? true}
          />
          {historyResult.ok ? (
            <AutoscalingTimeline events={history!.events} charges={history!.charges} />
          ) : (
            <p className="m-0 rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">
              Nie udało się pobrać historii autoskalowania: {historyResult.error}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-[10px] border border-line bg-card px-4 py-3.5">
            <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Bezpiecznik kosztów</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {cap > 0
                ? `Nie zapłacisz więcej niż ${liczba(cap, 2)} zł w 30 dni. Po osiągnięciu limitu zasoby wracają do planu, a strona działa dalej.`
                : service.autoscalingEnabled
                  ? 'Nie ustawiłeś limitu — autoskalowanie nalicza bez górnej granicy. Ustaw „Limit miesięczny” w formularzu.'
                  : 'Autoskalowanie jest wyłączone — nic nie naliczamy.'}
            </p>
            {acc ? (
              <Link href={calculatorPrefillHref(acc)} className="mt-3 inline-flex items-center gap-2 text-[13px] font-medium text-data-hi hover:underline">
                <Calculator className="h-4 w-4" /> Policz koszt obecnego dodatku
              </Link>
            ) : null}
          </section>
          <EcoModeCard subscriptionId={service.id} ecoModeEnabled={service.ecoModeEnabled} ecoPoints={ecoPoints} />
          <EcoReportCard report={ecoReport.ok ? ecoReport.data : null} failed={!ecoReport.ok} />
        </div>
      </div>
    </div>
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
  return gb % 1 === 0 ? `${liczba(gb, 0)} GB` : `${liczba(gb, 1)} GB`;
}

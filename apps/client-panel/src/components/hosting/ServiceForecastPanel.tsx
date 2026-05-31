'use client';

import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Lightbulb,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@verris/ui';
import type {
  ForecastResource,
  ForecastTrend,
  ServiceForecastDto,
  ServiceForecastResourceDto,
} from '@verris/contracts';
import { fetchServiceForecastAction } from '@/app/dashboard/services/[id]/hosting-forecast-actions';

const RESOURCE_LABEL: Record<ForecastResource, string> = {
  CPU: 'CPU',
  RAM: 'Pamięć RAM',
  DISK: 'Dysk',
  IO: 'I/O',
};

const CONFIDENCE_LABEL: Record<ServiceForecastDto['confidence'], string> = {
  low: 'niska',
  medium: 'średnia',
  high: 'wysoka',
};

const CONFIDENCE_STYLE: Record<ServiceForecastDto['confidence'], string> = {
  low: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  medium: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  high: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
};

export default function ServiceForecastPanel({ serviceId }: { serviceId: string }) {
  const [forecast, setForecast] = useState<ServiceForecastDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setForecast(await fetchServiceForecastAction(serviceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować prognozy.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-2 text-violet-200">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-white">Prognoza AI</h3>
            <p className="text-xs text-neutral-400">
              Szacowany trend wykorzystania zasobów na podstawie ostatnich metryk.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={loading}
          className="border-violet-400/40 text-violet-100"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizuję…
            </>
          ) : forecast ? (
            'Odśwież prognozę'
          ) : (
            'Generuj prognozę'
          )}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}

      {forecast && !forecast.available ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{forecast.unavailableReason ?? 'Prognoza jest chwilowo niedostępna.'}</span>
        </div>
      ) : null}

      {forecast && forecast.available ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${CONFIDENCE_STYLE[forecast.confidence]}`}
            >
              Pewność: {CONFIDENCE_LABEL[forecast.confidence]}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-neutral-300">
              Horyzont: {forecast.horizonDays} dni
            </span>
            <span className="text-neutral-500">
              {new Date(forecast.generatedAt).toLocaleString('pl-PL')}
            </span>
          </div>

          {forecast.summary ? <p className="text-sm text-neutral-200">{forecast.summary}</p> : null}

          {forecast.resources.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {forecast.resources.map((r) => (
                <ResourceCard key={r.resource} item={r} />
              ))}
            </div>
          ) : null}

          {forecast.recommendations.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                <Lightbulb className="h-3.5 w-3.5" /> Rekomendacje
              </p>
              <ul className="space-y-1.5">
                {forecast.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-200">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] text-neutral-500">
            Prognoza orientacyjna, generowana przez AI na podstawie historycznych metryk — nie stanowi gwarancji.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TrendIcon({ trend }: { trend: ForecastTrend }) {
  if (trend === 'up') return <ArrowUpRight className="h-4 w-4 text-rose-300" />;
  if (trend === 'down') return <ArrowDownRight className="h-4 w-4 text-emerald-300" />;
  if (trend === 'flat') return <ArrowRight className="h-4 w-4 text-neutral-300" />;
  return <ArrowRight className="h-4 w-4 text-neutral-500" />;
}

function ResourceCard({ item }: { item: ServiceForecastResourceDto }) {
  const current = clampPct(item.currentPct);
  const predicted = clampPct(item.predictedPct);
  const predictedHigh = (predicted ?? 0) >= 85;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{RESOURCE_LABEL[item.resource]}</span>
        <TrendIcon trend={item.trend} />
      </div>
      <div className="mt-2 space-y-2">
        <Bar label="Teraz" pct={current} tone="current" />
        <Bar label="Prognoza" pct={predicted} tone={predictedHigh ? 'danger' : 'predicted'} />
      </div>
      {item.daysToLimit != null ? (
        <p className="mt-2 text-xs text-amber-200">
          Szacowany czas do limitu: ~{Math.round(item.daysToLimit)} dni
        </p>
      ) : null}
      {item.note ? <p className="mt-1 text-xs text-neutral-400">{item.note}</p> : null}
    </div>
  );
}

function Bar({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number | null;
  tone: 'current' | 'predicted' | 'danger';
}) {
  const width = pct == null ? 0 : Math.max(2, Math.min(100, pct));
  const color =
    tone === 'danger' ? 'bg-rose-400/80' : tone === 'predicted' ? 'bg-violet-400/70' : 'bg-cyan-400/70';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>{label}</span>
        <span>{pct == null ? '—' : `${Math.round(pct)}%`}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function clampPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value < 0 ? 0 : value;
}

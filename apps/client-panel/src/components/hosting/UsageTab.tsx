'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Kpi, KpiStrip, MiniBars, SectionHead, fmtMb } from '@/components/panel/v2';
import { fetchHostingUsageAction, HostingUsageResponse } from '@/app/dashboard/services/[id]/hosting-usage-actions';
import ServiceForecastPanel from '@/components/hosting/ServiceForecastPanel';
import AccountStatsCard from '@/components/hosting/AccountStatsCard';
import { DiskUsagePanel } from '@/components/hosting/DiskUsagePanel';

export default function UsageTab({ serviceId }: { serviceId: string }) {
  const [window, setWindow] = useState<'24h' | '7d'>('24h');
  const [usage, setUsage] = useState<HostingUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Samo pobranie. Spinner i czyszczenie błędu przy montażu daje stan początkowy,
  // a przy zmianie okna — onClick przełącznika; efekt niczego nie ustawia synchronicznie.
  const fetchUsage = useCallback(
    (silent: boolean) =>
      fetchHostingUsageAction(serviceId, window)
        .then(setUsage)
        .catch((e) => {
          if (!silent) setError(e instanceof Error ? e.message : 'Nie udało się pobrać metryk użycia.');
        })
        .finally(() => {
          if (!silent) setLoading(false);
        }),
    [serviceId, window],
  );

  useEffect(() => {
    void fetchUsage(false);
  }, [fetchUsage]);

  // Live refresh: the node agent pushes a new 1-minute bucket each minute, so we
  // silently refetch every 30 s (no spinner) while the tab is open.
  useEffect(() => {
    const id = setInterval(() => {
      setError(null);
      void fetchUsage(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchUsage]);

  const latest = usage?.rows.at(-1);
  const chart = useMemo(() => usage?.rows.slice(-48) ?? [], [usage]);

  return (
    <div className="min-w-0 space-y-6">
      <SectionHead
        title="Zużycie zasobów"
        desc="Metryki z węzła, odświeżane co pół minuty. Najedź na słupek, żeby zobaczyć dokładną wartość."
        action={
          <div role="tablist" className="flex gap-0.5 rounded-[7px] border border-line-strong bg-card p-0.5">
            {(['24h', '7d'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={window === value}
                onClick={() => {
                  if (value !== window) {
                    setLoading(true);
                    setError(null);
                  }
                  setWindow(value);
                }}
                className={`rounded-[5px] px-2.5 py-1 text-[13px] ${window === value ? 'bg-raised font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      <KpiStrip>
        <Kpi label="CPU · teraz" value={latest?.cpuUsageAvg ?? '—'} unit={latest ? '%' : undefined} foot={<span>średnia z ostatniej minuty</span>} />
        <Kpi label="RAM · teraz" value={latest ? fmtMb(latest.memUsageAvgMb) : '—'} foot={<span>średnie zużycie pamięci</span>} />
        <Kpi label="Dysk" value={latest ? fmtMb(latest.diskUsageMb) : '—'} foot={<span>zajęte miejsce konta</span>} />
        <Kpi label="Zapis i odczyt" value={latest?.ioUsageKbps ?? '—'} unit={latest ? 'KB/s' : undefined} foot={<span>ruch na dysku</span>} />
      </KpiStrip>

      {error ? <p className="text-sm text-crit">{error}</p> : null}

      <section>
        <SectionHead title={`Obciążenie CPU · ${window === '24h' ? 'ostatnie 24 h' : 'ostatnie 7 dni'}`} />
        <div className="rounded-[10px] border border-line bg-card px-4 pb-4 pt-3">
          {loading && !usage ? (
            <p className="m-0 py-6 text-sm text-muted-foreground">Wczytywanie metryk…</p>
          ) : chart.length === 0 ? (
            <p className="m-0 py-6 text-sm text-muted-foreground">Brak zapisanych metryk w tym oknie.</p>
          ) : (
            <MiniBars
              values={chart.map((r) => r.cpuUsageAvg)}
              labels={chart.map((r) => new Date(r.bucketStart).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}
              unit="% CPU"
              format={(v) => String(Math.round(v))}
            />
          )}
        </div>
      </section>

      <AccountStatsCard serviceId={serviceId} />
      <DiskUsagePanel serviceId={serviceId} />
      <ServiceForecastPanel serviceId={serviceId} />
    </div>
  );
}

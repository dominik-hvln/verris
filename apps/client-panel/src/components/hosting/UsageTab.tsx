'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Kpi, KpiStrip, SectionHead, bucketize, fmtMb } from '@/components/panel/v2';
import { Wykres } from '@/components/panel/wykres';
import {
  fetchHostingUsageAction as fetchHostingUsageActionAkcja,
  HostingUsageResponse,
} from '@/app/dashboard/services/[id]/hosting-usage-actions';
import ServiceForecastPanel from '@/components/hosting/ServiceForecastPanel';
import AccountStatsCard from '@/components/hosting/AccountStatsCard';
import { DiskUsagePanel } from '@/components/hosting/DiskUsagePanel';
import { zOdpakowaniem } from '@/lib/wynik-akcji';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const fetchHostingUsageAction = zOdpakowaniem(fetchHostingUsageActionAkcja);

export default function UsageTab({ serviceId }: { serviceId: string }) {
  const [usage, setUsage] = useState<HostingUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Samo pobranie. Spinner i czyszczenie błędu przy montażu daje stan początkowy; efekt niczego
  // nie ustawia synchronicznie. 7 dni z prognozą rysuje ServiceForecastPanel (średnie godzinowe z API) —
  // dawny przełącznik „7d” brał 48 ostatnich minut z 500 najnowszych próbek, czyli nie 7 dni.
  const fetchUsage = useCallback(
    (silent: boolean) =>
      fetchHostingUsageAction(serviceId, '24h')
        .then(setUsage)
        .catch((e) => {
          if (!silent) setError(e instanceof Error ? e.message : 'Nie udało się pobrać metryk użycia.');
        })
        .finally(() => {
          if (!silent) setLoading(false);
        }),
    [serviceId],
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
  // 24 h minutowych próbek → 48 słupków po pół godziny (szczyt w kubełku).
  const cpu = useMemo(() => {
    const b = bucketize((usage?.rows ?? []).map((r) => ({ bucketStart: r.bucketStart, value: r.cpuUsageAvg })), 48);
    return b.values.map((v, i) => ({ v, label: b.labels[i] ?? '' }));
  }, [usage]);

  return (
    <div className="min-w-0 space-y-6">
      <SectionHead
        title="Zużycie i prognoza"
        desc="Dane z serwera Twojej usługi, odświeżane co pół minuty. Najedź na wykres albo użyj strzałek na klawiaturze, żeby zobaczyć dokładną wartość."
      />

      <KpiStrip>
        <Kpi label="CPU · teraz" value={latest?.cpuUsageAvg ?? '—'} unit={latest ? '%' : undefined} foot={<span>średnia z ostatniej minuty</span>} />
        <Kpi label="RAM · teraz" value={latest ? fmtMb(latest.memUsageAvgMb) : '—'} foot={<span>średnie zużycie pamięci</span>} />
        <Kpi label="Dysk" value={latest ? fmtMb(latest.diskUsageMb) : '—'} foot={<span>zajęte miejsce konta</span>} />
        <Kpi label="Zapis i odczyt" value={latest?.ioUsageKbps ?? '—'} unit={latest ? 'KB/s' : undefined} foot={<span>ruch na dysku</span>} />
      </KpiStrip>

      {error ? <p className="text-sm text-crit">{error}</p> : null}

      <ServiceForecastPanel serviceId={serviceId} />

      <section>
        <SectionHead title="Obciążenie CPU · ostatnie 24 h" />
        <div className="rounded-[10px] border border-line bg-card px-4 pb-4 pt-8">
          {loading && !usage ? (
            <p className="m-0 py-6 text-sm text-muted-foreground">Wczytywanie metryk…</p>
          ) : cpu.length === 0 ? (
            <p className="m-0 py-6 text-sm text-muted-foreground">Brak zapisanych metryk w tym oknie.</p>
          ) : (
            <Wykres wariant="slupki" punkty={cpu} nazwa="Obciążenie CPU w ostatnich 24 godzinach, szczyt w półgodzinnych przedziałach" format={(v) => `${Math.round(v)}% CPU`} wysokosc={90} />
          )}
        </div>
      </section>

      <AccountStatsCard serviceId={serviceId} />
      <DiskUsagePanel serviceId={serviceId} />
    </div>
  );
}

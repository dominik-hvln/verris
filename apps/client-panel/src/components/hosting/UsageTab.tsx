'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingUsageAction, HostingUsageResponse } from '@/app/dashboard/services/[id]/hosting-usage-actions';
import { ServiceUptimeBadge } from '@/components/hosting/service-uptime-badge';
import { HostingBackupRestorePanel } from '@/components/hosting/hosting-backup-restore-panel';

export default function UsageTab({ serviceId }: { serviceId: string }) {
  const [window, setWindow] = useState<'24h' | '7d'>('24h');
  const [usage, setUsage] = useState<HostingUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsage(await fetchHostingUsageAction(serviceId, window));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać metryk użycia.');
    } finally {
      setLoading(false);
    }
  }, [serviceId, window]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = usage?.rows.at(-1);
  const chart = useMemo(() => usage?.rows.slice(-48) ?? [], [usage]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Usage &amp; backup</h2>
            <p className="text-xs text-neutral-400">Metryki CPU/RAM/dysk oraz badge uptime (w tej zakładce).</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['24h', '7d'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWindow(value)}
              className={window === value ? 'border-cyan-400/50 text-cyan-100' : 'border-white/15 text-white'}
            >
              {value}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="border-white/15 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ServiceUptimeBadge serviceId={serviceId} />
      <HostingBackupRestorePanel serviceId={serviceId} />

      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
      {loading && !usage ? (
        <p className="text-sm text-neutral-400">Wczytywanie metryk…</p>
      ) : chart.length === 0 ? (
        <p className="text-sm text-neutral-400">Brak zapisanych metryk dla wybranego okna.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="CPU avg" value={`${latest?.cpuUsageAvg ?? 0}%`} />
            <Metric label="RAM avg" value={`${latest?.memUsageAvgMb ?? 0} MB`} />
            <Metric label="Dysk" value={`${latest?.diskUsageMb ?? 0} MB`} />
            <Metric label="I/O" value={`${latest?.ioUsageKbps ?? 0} KB/s`} />
          </div>
          <div className="flex h-32 items-end gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            {chart.map((row) => (
              <div
                key={row.bucketStart}
                className="min-w-1 flex-1 rounded-t bg-cyan-400/70"
                title={`${new Date(row.bucketStart).toLocaleString('pl-PL')}: CPU ${row.cpuUsageAvg}%`}
                style={{ height: `${Math.max(4, Math.min(100, row.cpuUsageAvg))}%` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

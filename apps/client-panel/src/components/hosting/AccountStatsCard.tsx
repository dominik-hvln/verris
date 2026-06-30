'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, Globe, HardDrive, Loader2, Mail, Network } from 'lucide-react';
import { fetchHostingStatsAction, type HostingStats } from '@/app/dashboard/services/[id]/hosting-stats-actions';

function fmtMb(mb: number): string {
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(2)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

function Bar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const color = pct == null ? 'bg-emerald-500' : pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${color}`} style={{ width: `${pct ?? 6}%` }} />
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {fmtMb(used)} {limit && limit > 0 ? <>z {fmtMb(limit)} {pct != null && <span className="text-neutral-500">({pct}%)</span>}</> : <span className="text-neutral-500">/ bez limitu</span>}
      </p>
    </div>
  );
}

export default function AccountStatsCard({ serviceId }: { serviceId: string }) {
  const [data, setData] = useState<HostingStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await fetchHostingStatsAction(serviceId)); } catch { setData(null); } finally { setLoading(false); }
  }, [serviceId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie statystyk…</div>;
  }
  if (!data) return null;

  const counts: { icon: typeof Globe; label: string; value: number }[] = [
    { icon: Globe, label: 'Domeny', value: data.counts.domains },
    { icon: Network, label: 'Subdomeny', value: data.counts.subdomains },
    { icon: Mail, label: 'Skrzynki', value: data.counts.emails },
    { icon: Database, label: 'Bazy', value: data.counts.databases },
    { icon: HardDrive, label: 'FTP', value: data.counts.ftp },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Activity className="h-4 w-4 text-emerald-300" /> Statystyki konta</h3>
      {data.fetchError ? (
        <p className="mt-2 text-xs text-amber-300/80">{data.fetchError}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300"><Network className="h-3.5 w-3.5 text-emerald-300" /> Transfer (bież. okres)</p>
              <Bar used={data.bandwidth.usedMb} limit={data.bandwidth.limitMb} />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300"><HardDrive className="h-3.5 w-3.5 text-emerald-300" /> Dysk</p>
              <Bar used={data.disk.usedMb} limit={data.disk.limitMb} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {counts.map((c) => (
              <div key={c.label} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center">
                <c.icon className="mx-auto h-4 w-4 text-neutral-400" />
                <div className="mt-1 text-lg font-bold text-white">{c.value}</div>
                <div className="text-[11px] text-neutral-500">{c.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

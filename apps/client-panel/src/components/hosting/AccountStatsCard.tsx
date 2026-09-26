'use client';

import { useEffect, useState } from 'react';
import { Activity, Database, Globe, HardDrive, Loader2, Mail, Network } from 'lucide-react';
import { fetchHostingStatsAction, type HostingStats } from '@/app/dashboard/services/[id]/hosting-stats-actions';
import { liczba } from '@/lib/liczba';

function fmtMb(mb: number): string {
  if (mb >= 1024 * 1024) return `${liczba(mb / 1024 / 1024, 2)} TB`;
  if (mb >= 1024) return `${liczba(mb / 1024, 2)} GB`;
  return `${Math.round(mb)} MB`;
}

function Bar({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const color = pct == null ? 'bg-primary text-primary-foreground font-semibold' : pct >= 90 ? 'bg-crit/12' : pct >= 75 ? 'bg-warn-soft' : 'bg-primary text-primary-foreground font-semibold';
  return (
    <div className="mt-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
        <div className={`h-full ${color}`} style={{ width: `${pct ?? 6}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {fmtMb(used)} {limit && limit > 0 ? <>z {fmtMb(limit)} {pct != null && <span className="text-muted-foreground">({pct}%)</span>}</> : <span className="text-muted-foreground">/ bez limitu</span>}
      </p>
    </div>
  );
}

export default function AccountStatsCard({ serviceId }: { serviceId: string }) {
  const [data, setData] = useState<HostingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchHostingStatsAction(serviceId)
      .then(setData, () => setData(null))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return <div className="flex items-center gap-2 rounded-[10px] border border-line bg-raised p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie statystyk…</div>;
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
    <section className="rounded-[10px] border border-line bg-raised p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Activity className="h-4 w-4 text-data-hi" /> Statystyki konta</h3>
      {data.fetchError ? (
        <p className="mt-2 text-xs text-warn">{data.fetchError}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[10px] border border-line bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--verris-body)]"><Network className="h-3.5 w-3.5 text-data-hi" /> Transfer (bież. okres)</p>
              <Bar used={data.bandwidth.usedMb} limit={data.bandwidth.limitMb} />
            </div>
            <div className="rounded-[10px] border border-line bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--verris-body)]"><HardDrive className="h-3.5 w-3.5 text-data-hi" /> Dysk</p>
              <Bar used={data.disk.usedMb} limit={data.disk.limitMb} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {counts.map((c) => (
              <div key={c.label} className="rounded-[7px] border border-line bg-background px-3 py-2 text-center">
                <c.icon className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-1 text-lg font-bold text-foreground">{c.value}</div>
                <div className="text-[11px] text-muted-foreground">{c.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

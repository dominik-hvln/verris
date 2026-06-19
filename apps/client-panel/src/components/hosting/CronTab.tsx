'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import type { HostingCronJobDto } from '@verris/contracts';
import { fetchHostingCronAction } from '@/app/dashboard/services/[id]/hosting-extra-actions';

export default function CronTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingCronJobDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchHostingCronAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać zadań cron.'))
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
        {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-neutral-500">
        <Clock className="h-8 w-8 opacity-20" />
        Nie skonfigurowano jeszcze zadań cyklicznych.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="font-mono text-xs text-neutral-400">{row.schedule}</p>
          <p className="mt-1 font-mono text-sm text-white">{row.command}</p>
        </div>
      ))}
    </div>
  );
}

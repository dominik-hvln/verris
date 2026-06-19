'use client';

import { useEffect, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import type { HostingBackupRowDto } from '@verris/contracts';
import { fetchHostingBackupsAction } from '@/app/dashboard/services/[id]/hosting-extra-actions';
import { BackupNowButton } from '@/app/dashboard/backups/backup-now-button';

export default function BackupsTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingBackupRowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchHostingBackupsAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kopii.'))
      .finally(() => setLoading(false));
  }, [serviceId]);

  return (
    <div className="space-y-4">
      <BackupNowButton serviceId={serviceId} />
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-neutral-500">
          <Database className="h-8 w-8 opacity-20" />
          Brak kopii zapasowych. Pierwsza kopia pojawi się po jej utworzeniu.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white"
            >
              <Database className="h-4 w-4 text-neutral-400" />
              <span className="font-mono">{row.fileName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

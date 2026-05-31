'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ExternalLink, Loader2 } from 'lucide-react';
import {
  fetchHostingBackupsAction,
  fetchHostingRestorePreviewAction,
} from '@/app/dashboard/services/[id]/hosting-backup-actions';
import type { HostingRestorePreview } from '@/app/dashboard/hosting-tools-data';
import type { HostingBackupsResponseDto } from '@verris/contracts';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';

export function HostingBackupRestorePanel({ serviceId }: { serviceId: string }) {
  const [backups, setBackups] = useState<HostingBackupsResponseDto | null>(null);
  const [preview, setPreview] = useState<HostingRestorePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHostingBackupsAction(serviceId);
      setBackups(list);
      const firstId = list.rows[0]?.id ?? list.rows[0]?.fileName;
      setPreview(await fetchHostingRestorePreviewAction(serviceId, firstId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać kopii zapasowych.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectBackup = async (backupId: string) => {
    try {
      setPreview(await fetchHostingRestorePreviewAction(serviceId, backupId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się załadować podglądu restore.');
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Kopie zapasowe i podgląd restore</p>
          <p className="text-xs text-neutral-500">Podgląd dostępnych kopii zapasowych.</p>
        </div>
        <Link
          href={`/dashboard/backups?serviceId=${encodeURIComponent(serviceId)}`}
          className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100"
        >
          Pełny panel backupów
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wczytywanie…
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}

      {preview?.backup ? (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
          <p className="text-sm font-medium text-cyan-100">
            Podgląd restore: {preview.backup.fileName}
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Zakres:{' '}
            {preview.restoreScope
              .map((item) => `${item.area}${item.count === null ? '' : ` (${item.count})`}`)
              .join(' · ')}
          </p>
          {preview.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-amber-200/90">
              {w}
            </p>
          ))}
        </div>
      ) : !loading && !error ? (
        <p className="text-sm text-neutral-500">Brak kopii do podglądu restore.</p>
      ) : null}

      {backups && backups.rows.length > 0 ? (
        <ul className="space-y-2">
          {backups.rows.slice(0, 5).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => void selectBackup(row.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-sm text-neutral-200 hover:border-white/20"
              >
                <Archive className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">{row.fileName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : backups && !backups.fetchError && !loading ? (
        <p className="text-sm text-neutral-500">Brak archiwów backup na koncie.</p>
      ) : null}
      {backups?.fetchError ? (
        <p className="text-xs text-amber-200">{hostingFetchErrorMessage(backups.fetchError)}</p>
      ) : null}
    </div>
  );
}

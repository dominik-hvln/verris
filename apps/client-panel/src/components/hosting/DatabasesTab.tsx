'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDatabasesAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';

interface Props {
  serviceId: string;
}

export default function DatabasesTab({ serviceId }: Props) {
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<{ name: string }[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const dbRes = await fetchHostingDatabasesAction(serviceId);
      setDatabases(dbRes.databases);
      setFetchError(dbRes.fetchError);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać listy baz.');
      setDatabases([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie baz…
      </div>
    );
  }

  const databasesUrl = links.databasesUrl;

  return (
    <HostingTabShell
      title="Bazy MySQL"
      description="Lista baz danych przypisanych do usługi."
      icon={<Database className="h-4 w-4" />}
      actions={
        <>
          {databasesUrl ? (
            <DaExternalLink href={databasesUrl} variant="primary">
              Zarządzaj bazami
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-white hover:bg-white/10 text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/5 bg-[#050505] overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-white/5 border-b border-white/5 text-left">
            <tr>
              <th className="py-3 px-3 text-neutral-300 font-semibold">Nazwa bazy</th>
              <th className="py-3 px-3 text-right text-neutral-300 font-semibold">phpMyAdmin</th>
            </tr>
          </thead>
          <tbody>
            {databases.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={2} className="px-3 py-8 text-center text-neutral-500 text-xs">
                  Brak baz — utwórz je w panelu hostingu.
                </td>
              </tr>
            ) : null}
            {databases.map((db) => (
              <tr key={db.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="font-mono py-3 px-3 text-white truncate max-w-[200px]" title={db.name}>
                  {db.name}
                </td>
                <td className="py-3 px-3 text-right">
                  {databasesUrl ? (
                    <a
                      href={databasesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-300 hover:text-white whitespace-nowrap"
                    >
                      Otwórz →
                    </a>
                  ) : (
                    <span className="text-neutral-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HostingTabShell>
  );
}

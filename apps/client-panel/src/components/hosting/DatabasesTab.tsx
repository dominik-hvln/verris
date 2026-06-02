'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDatabasesAction } from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { ResponsiveDataView } from '@/components/panel';
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

      {databases.length === 0 && !fetchError ? (
        <p className="rounded-xl border border-white/5 bg-[#050505] px-3 py-8 text-center text-xs text-neutral-500">
          Brak baz — utwórz je w panelu hostingu.
        </p>
      ) : (
        <ResponsiveDataView
          rows={databases}
          rowKey={(db) => db.name}
          tableClassName="rounded-xl border border-white/5 bg-[#050505]"
          columns={[
            {
              key: 'name',
              header: 'Nazwa bazy',
              cell: (db) => (
                <span className="font-mono text-white" title={db.name}>
                  {db.name}
                </span>
              ),
            },
            {
              key: 'pma',
              header: 'phpMyAdmin',
              headerClassName: 'text-right',
              cellClassName: 'text-right',
              cell: (db) =>
                databasesUrl ? (
                  <a
                    href={databasesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neutral-300 hover:text-white"
                  >
                    Otwórz →
                  </a>
                ) : (
                  <span className="text-xs text-neutral-600">—</span>
                ),
            },
          ]}
          renderMobileCard={(db) => (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-[#050505] p-3">
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-white">{db.name}</span>
              {databasesUrl ? (
                <a
                  href={databasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-neutral-300 hover:text-white"
                >
                  phpMyAdmin →
                </a>
              ) : null}
            </div>
          )}
        />
      )}
    </HostingTabShell>
  );
}

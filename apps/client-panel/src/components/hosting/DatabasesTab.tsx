'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@ekohost/ui';
import {
  fetchHostingDatabasesAction,
  fetchHostingDaLinksAction,
} from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';

interface Props {
  serviceId: string;
}

export default function DatabasesTab({ serviceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<{ name: string }[]>([]);
  const [daUsername, setDaUsername] = useState<string | null>(null);
  const [databasesDaUrl, setDatabasesDaUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dbRes, linksRes] = await Promise.all([
        fetchHostingDatabasesAction(serviceId),
        fetchHostingDaLinksAction(serviceId).catch(() => null),
      ]);
      setDatabases(dbRes.databases);
      setDaUsername(dbRes.daUsername);
      setFetchError(dbRes.fetchError);
      setDatabasesDaUrl(linksRes?.databasesUrl ?? null);
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
      <div className="flex items-center justify-center gap-3 py-24 text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        Wczytywanie baz MySQL z DirectAdmin…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="relative rounded-[32px] p-px overflow-hidden group">
        <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a] p-6 lg:p-8 flex flex-col z-10 transition-colors duration-300 border border-white/10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4 border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-white/5 text-white border border-white/10 shadow-inner">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">Twoje bazy MySQL</h2>
                <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                  Lista synchronizowana z{' '}
                  <span className="font-mono text-neutral-200">
                    CMD_API_DATABASES
                  </span>{' '}
                  (
                  {daUsername ?? '—'}
                  ). Zarządzanie i phpMyAdmin w panelu DA.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {databasesDaUrl ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
                >
                  <a href={databasesDaUrl} target="_blank" rel="noopener noreferrer">
                    Otwórz bazy w DirectAdmin
                  </a>
                </Button>
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
                className="gap-2 border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Odśwież
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              {error}
            </div>
          ) : null}

          {fetchError ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>Odczyt z DirectAdmin: {fetchError}</span>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/5 bg-[#050505] overflow-x-auto shadow-inner">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/5 text-left">
                <tr>
                  <th className="py-4 px-4 text-neutral-300 font-semibold">Nazwa bazy</th>
                  <th className="px-4 text-right text-neutral-300 font-semibold">/phpMyAdmin</th>
                </tr>
              </thead>
              <tbody>
                {databases.length === 0 && !fetchError ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-neutral-500">
                      Brak utworzonych baz lub konto nie jest jeszcze provisionowane.
                    </td>
                  </tr>
                ) : null}
                {databases.map((db) => (
                  <tr
                    key={db.name}
                    className="border-b border-white/5 hover:bg-white/5 group/row transition-colors"
                  >
                    <td className="font-mono py-4 px-4 text-white">{db.name}</td>
                    <td className="px-4 text-right">
                      {databasesDaUrl ? (
                        <a
                          href={databasesDaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 px-3 whitespace-nowrap bg-[#121212] hover:bg-white/10 text-neutral-300 hover:text-white font-medium text-xs rounded-lg transition-all border border-white/10"
                        >
                          Zarządzaj w DA →
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
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw, AlertCircle, ExternalLink, Plus, Trash2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import {
  createHostingDatabaseAction,
  deleteHostingDatabaseAction,
  fetchHostingDatabasesAction,
} from '@/app/dashboard/services/[id]/hosting-mysql-links-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';

interface Props {
  serviceId: string;
}

function genPassword(len = 18): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export default function DatabasesTab({ serviceId }: Props) {
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<{ name: string }[]>([]);
  const [engine, setEngine] = useState<{ name: string; version: string } | null>(null);

  // create form
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const dbRes = await fetchHostingDatabasesAction(serviceId);
      setDatabases(dbRes.databases);
      setEngine(dbRes.engine);
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await createHostingDatabaseAction(serviceId, {
      name: name.trim(),
      user: user.trim(),
      password,
    });
    setCreating(false);
    if (!res.ok) {
      toast.error('Nie udało się utworzyć bazy', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Baza utworzona', { description: `${res.database} (użytkownik ${res.username})` });
    setName('');
    setUser('');
    setPassword('');
    void load();
  };

  const onDelete = async (full: string) => {
    if (!window.confirm(`Usunąć bazę „${full}"? Tej operacji nie można cofnąć.`)) return;
    setDeleting(full);
    const res = await deleteHostingDatabaseAction(serviceId, full);
    setDeleting(null);
    if (!res.ok) {
      toast.error('Nie udało się usunąć bazy', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Baza usunięta');
    void load();
  };

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
      description="Twórz, przeglądaj i usuwaj bazy danych — bez wychodzenia z panelu."
      icon={<Database className="h-4 w-4" />}
      help={{
        blurb:
          'Nie musisz znać się na bazach. Wpisz nazwę, a my utworzymy bazę i użytkownika z prefiksem konta. Dane do podłączenia aplikacji pokażemy od razu.',
        kbQuery: 'baza danych MySQL',
      }}
      actions={
        <>
          {databasesUrl ? (
            <DaExternalLink href={databasesUrl} variant="outline">
              phpMyAdmin
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
      {/* Create form */}
      <form
        onSubmit={onCreate}
        className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Nowa baza danych</p>
          {engine ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-neutral-300"
              title="Silnik bazy danych na Twoim serwerze"
            >
              <Database className="h-3 w-3 text-emerald-400" />
              Silnik: <span className="font-mono text-white">{engine.name} {engine.version}</span>
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Nazwa bazy</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. sklep"
              maxLength={16}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Użytkownik</span>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="np. sklep_usr"
              maxLength={16}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Hasło</span>
            <div className="flex gap-1.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 znaków"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
              />
              <button
                type="button"
                title="Wygeneruj hasło"
                onClick={() => setPassword(genPassword())}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-neutral-300 hover:bg-white/10"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          DirectAdmin doda prefiks konta do nazwy bazy i użytkownika (np. <span className="font-mono">user_sklep</span>).
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={creating || !name.trim() || !user.trim() || password.length < 8}
            className="h-8 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Utwórz bazę
          </Button>
        </div>
      </form>

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
          Brak baz — utwórz pierwszą powyżej.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
          {databases.map((db) => (
            <div
              key={db.name}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-0"
            >
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-white" title={db.name}>
                {db.name}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                {databasesUrl ? (
                  <a
                    href={databasesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    phpMyAdmin →
                  </a>
                ) : null}
                <button
                  type="button"
                  title="Usuń bazę"
                  disabled={deleting === db.name}
                  onClick={() => void onDelete(db.name)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {deleting === db.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </HostingTabShell>
  );
}

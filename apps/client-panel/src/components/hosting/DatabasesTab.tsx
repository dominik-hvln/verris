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
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import DbAccessHosts from '@/components/hosting/DbAccessHosts';
import DbUsers from '@/components/hosting/DbUsers';
import { DbTransferPanel } from '@/components/hosting/DbTransferPanel';
import { SlowSqlPanel } from '@/components/hosting/SlowSqlPanel';
import { PgsqlPanel } from '@/components/hosting/PgsqlPanel';
import { createHostingSsoUrlAction } from '@/app/dashboard/services/[id]/hosting-sso-actions';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { potwierdz } from '@/components/panel/potwierdz';

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
  const [pmaOpening, setPmaOpening] = useState(false);

  /**
   * SPRINT-1c — phpMyAdmin bez przepisywania haseł: jednorazowy URL SSO.
   * Okno otwieramy PRZED awaitem (polityka popupów), a potem podmieniamy adres;
   * przy błędzie wracamy do zwykłego linku do panelu hostingu.
   */
  const openPhpMyAdmin = async () => {
    if (pmaOpening) return;
    setPmaOpening(true);
    const win = window.open('about:blank', '_blank', 'noopener');
    const res = await createHostingSsoUrlAction(serviceId, 'phpmyadmin');
    setPmaOpening(false);
    if (res.ok) {
      if (win) win.location.href = res.url;
      else window.open(res.url, '_blank');
      return;
    }
    if (win) win.close();
    if (links.databasesUrl) {
      toast.info('Auto-logowanie niedostępne — otwieram panel baz danych', {
        description: daErrorMessage(res.error),
      });
      window.open(links.databasesUrl, '_blank');
    } else {
      toast.error('Nie udało się otworzyć phpMyAdmin', { description: daErrorMessage(res.error) });
    }
  };

  // Samo pobranie — przy montażu `error` jest już pusty, więc efekt nie musi go zerować.
  const fetchDatabases = useCallback(
    () =>
      fetchHostingDatabasesAction(serviceId)
        .then((dbRes) => {
          setDatabases(dbRes.databases);
          setEngine(dbRes.engine);
          setFetchError(dbRes.fetchError);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Nie udało się pobrać listy baz.');
          setDatabases([]);
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        }),
    [serviceId],
  );

  const load = useCallback(() => {
    setError(null);
    return fetchDatabases();
  }, [fetchDatabases]);

  useEffect(() => {
    void fetchDatabases();
  }, [fetchDatabases]);

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
    if (!(await potwierdz(`Usunąć bazę „${full}"? Tej operacji nie można cofnąć.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie baz…
      </div>
    );
  }

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pmaOpening}
            onClick={() => void openPhpMyAdmin()}
            className="h-8 gap-1.5 border-line-strong bg-raised text-foreground hover:bg-raised text-xs"
            title="Otwiera phpMyAdmin bez logowania (jednorazowy link)"
          >
            {pmaOpening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            phpMyAdmin
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            className="h-8 gap-1.5 border-line-strong bg-raised text-foreground hover:bg-raised text-xs"
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
        className="mb-5 rounded-[10px] border border-line bg-raised p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Nowa baza danych</p>
          {engine ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-background px-2.5 py-1 text-[11px] text-[color:var(--verris-body)]"
              title="Silnik bazy danych na Twoim serwerze"
            >
              <Database className="h-3 w-3 text-data-hi" />
              Silnik: <span className="font-mono text-foreground">{engine.name} {engine.version}</span>
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Nazwa bazy</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. sklep"
              maxLength={16}
              className="w-full rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Użytkownik</span>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="np. sklep_usr"
              maxLength={16}
              className="w-full rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Hasło</span>
            <div className="flex gap-1.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 znaków"
                className="w-full rounded-[7px] border border-line bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data"
              />
              <button
                type="button"
                title="Wygeneruj hasło"
                onClick={() => setPassword(genPassword())}
                className="shrink-0 rounded-[7px] border border-line bg-raised px-2.5 text-[color:var(--verris-body)] hover:bg-raised"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Do nazwy bazy i użytkownika dodamy prefiks konta (np. <span className="font-mono">user_sklep</span>).
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={creating || !name.trim() || !user.trim() || password.length < 8}
            className="h-8 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Utwórz bazę
          </Button>
        </div>
      </form>

      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-crit/30 bg-crit/12 px-3 py-2 text-xs text-crit">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      {databases.length === 0 && !fetchError ? (
        <p className="rounded-[10px] border border-line bg-card px-3 py-8 text-center text-xs text-muted-foreground">
          Brak baz — utwórz pierwszą powyżej.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line bg-card">
          {databases.map((db) => (
            <div
              key={db.name}
              className="border-b border-line px-4 py-2.5 last:border-0"
            >
              <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-foreground" title={db.name}>
                {db.name}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => void openPhpMyAdmin()}
                  disabled={pmaOpening}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  phpMyAdmin →
                </button>
                <button
                  type="button"
                  title="Usuń bazę"
                  disabled={deleting === db.name}
                  onClick={() => void onDelete(db.name)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised text-crit hover:bg-crit/12 disabled:opacity-50"
                >
                  {deleting === db.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
              </div>
              <DbUsers serviceId={serviceId} db={db.name} />
              <DbAccessHosts serviceId={serviceId} db={db.name} />
            </div>
          ))}
        </div>
      )}
      <DbTransferPanel serviceId={serviceId} databases={databases.map((d) => d.name)} />
      <SlowSqlPanel serviceId={serviceId} />
      <PgsqlPanel serviceId={serviceId} />
    </HostingTabShell>
  );
}

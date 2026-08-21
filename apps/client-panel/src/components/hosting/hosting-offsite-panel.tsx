'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchOffsiteStatusAction,
  queueOffsiteFetchAction,
  queueOffsiteListAction,
  type OffsiteRestoreStatusDto,
} from '@/app/dashboard/services/[id]/hosting-offsite-actions';

/**
 * S-1 — kopie OFF-SITE w panelu klienta.
 *
 * Dwa kroki, bez żargonu: „Pokaż kopie poza serwerem" → „Pobierz na serwer".
 * Po pobraniu archiwum ląduje na zwykłej liście kopii powyżej i klient odtwarza
 * je istniejącym, potwierdzanym domeną przyciskiem „Przywróć z tej kopii" —
 * dlatego ten panel nigdy sam nie nadpisuje danych.
 */
export function HostingOffsitePanel({
  serviceId,
  onFetched,
}: {
  serviceId: string;
  onFetched?: () => void;
}) {
  const [state, setState] = useState<OffsiteRestoreStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [snapshot, setSnapshot] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasBusyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setState(await fetchOffsiteStatusAction(serviceId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się sprawdzić kopii off-site.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zadanie robi węzeł — odpytujemy do skutku, potem odświeżamy listę kopii DA.
  useEffect(() => {
    const busy = Boolean(state?.busy);
    if (busy && !pollRef.current) {
      wasBusyRef.current = true;
      pollRef.current = setInterval(() => void load(), 5_000);
    }
    if (!busy && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      if (wasBusyRef.current) {
        wasBusyRef.current = false;
        if (state?.lastFetch?.status === 'COMPLETED') onFetched?.();
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state?.busy, state?.lastFetch?.status, load, onFetched]);

  const run = async (key: string, fn: () => Promise<OffsiteRestoreStatusDto>) => {
    setBusyAction(key);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operacja nie powiodła się.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Sprawdzam kopie poza serwerem…
      </p>
    );
  }
  if (!state) return null;

  const busy = state.busy || busyAction !== null;
  const listFailed = state.lastList?.status === 'FAILED';
  const fetchFailed = state.lastFetch?.status === 'FAILED';

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {state.offsite.protected ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">Kopia poza serwerem (off-site)</p>
            <p className="text-xs text-neutral-400">
              {state.offsite.protected
                ? `Dodatkowa kopia Twojego konta leży poza tym serwerem — przetrwa nawet jego awarię.${
                    state.offsite.lastRunAt
                      ? ' Ostatnia: ' +
                        new Date(state.offsite.lastRunAt).toLocaleString('pl-PL') +
                        '.'
                      : ''
                  }`
                : 'Kopia off-site dla tego konta nie została jeszcze potwierdzona — napisz do nas, zanim będzie potrzebna.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            void run('list', () => queueOffsiteListAction(serviceId, showOlder ? snapshot : undefined))
          }
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-100 hover:border-white/25 disabled:opacity-40"
        >
          {busy && (busyAction === 'list' || state.busy) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {state.listedAt ? 'Odśwież listę' : 'Pokaż kopie poza serwerem'}
        </button>
      </div>

      {/* Starsza wersja — schowana, bo 9 na 10 klientów chce po prostu najnowszą. */}
      <div className="text-xs">
        <button
          type="button"
          onClick={() => setShowOlder((v) => !v)}
          className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-200"
        >
          <History className="h-3.5 w-3.5" />
          {showOlder ? 'Ukryj starsze wersje' : 'Szukam kopii z konkretnego dnia'}
        </button>
        {showOlder ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={snapshot}
              onChange={(e) => setSnapshot(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="RRRRMMDD, np. 20260715"
              inputMode="numeric"
              spellCheck={false}
              className="w-48 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-white placeholder:text-neutral-500 focus:border-cyan-400/50 focus:outline-none"
            />
            <span className="text-neutral-500">
              Wersje trzymamy przez ograniczony czas — jeśli dnia nie ma, lista będzie pusta.
            </span>
          </div>
        ) : null}
      </div>

      {state.busy ? (
        <p className="flex items-center gap-2 text-xs text-cyan-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Serwer pracuje nad kopią off-site… To potrwa chwilę, możesz zostać na tej stronie.
        </p>
      ) : null}
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {listFailed && !state.busy ? (
        <p className="text-xs text-rose-200">
          {state.lastList?.errorMessage ?? 'Nie udało się odczytać kopii off-site.'}
        </p>
      ) : null}

      {state.archives.length > 0 ? (
        <ul className="space-y-2">
          {state.archives.map((archive) => {
            const isFetched = state.fetchedArchive === archive.name;
            return (
              <li
                key={archive.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-neutral-100">{archive.name}</p>
                  <p className="text-[11px] text-neutral-500">
                    {archive.modifiedAt
                      ? new Date(archive.modifiedAt).toLocaleString('pl-PL')
                      : 'data nieznana'}
                    {archive.sizeBytes ? ` · ${formatBytes(archive.sizeBytes)}` : ''}
                  </p>
                </div>
                {isFetched ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Na serwerze
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void run(`fetch:${archive.name}`, () =>
                        queueOffsiteFetchAction(
                          serviceId,
                          archive.name,
                          showOlder ? snapshot : (state.snapshot ?? undefined),
                        ),
                      )
                    }
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"
                  >
                    {busyAction === `fetch:${archive.name}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudDownload className="h-3.5 w-3.5" />
                    )}
                    Pobierz na serwer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : state.listedAt && !state.busy ? (
        <p className="text-xs text-neutral-500">
          Nie znaleźliśmy archiwów off-site dla tego konta
          {state.snapshot ? ` z dnia ${state.snapshot}` : ''}. Napisz do nas, sprawdzimy to razem.
        </p>
      ) : null}

      {fetchFailed && !state.busy ? (
        <p className="text-xs text-rose-200">
          {state.lastFetch?.errorMessage ?? 'Pobranie archiwum nie powiodło się.'}
        </p>
      ) : null}

      {state.fetchedArchive && !state.busy ? (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Archiwum <span className="font-mono">{state.fetchedArchive}</span> jest już na serwerze.
            Wybierz je z listy kopii powyżej i kliknij „Przywróć z tej kopii" — poprosimy jeszcze o
            potwierdzenie domeny.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

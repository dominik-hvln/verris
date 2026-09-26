'use client';

import { KOPIE_OFFSITE_DNI } from '@verris/contracts';
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
import { liczba } from '@/lib/liczba';

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

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const load = useCallback(
    () =>
      fetchOffsiteStatusAction(serviceId)
        .then((s) => {
          setState(s);
          setError(null);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Nie udało się sprawdzić kopii off-site.');
        })
        .finally(() => {
          setLoading(false);
        }),
    [serviceId],
  );

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
      <p className="flex items-center gap-2 rounded-[7px] border border-line bg-background px-3 py-2 text-xs text-muted-foreground">
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
    <div className="space-y-3 rounded-[10px] border border-line bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {state.offsite.protected ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-data-hi" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">Kopia poza serwerem (off-site)</p>
            <p className="text-xs text-muted-foreground">
              {state.offsite.protected
                ? `Dodatkowa kopia Twojego konta leży poza tym serwerem — przetrwa nawet jego awarię. Trzymamy wersje z ${KOPIE_OFFSITE_DNI} dni.${
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
          className="inline-flex items-center gap-2 rounded-[7px] border border-line-strong bg-raised px-3 py-1.5 text-xs font-medium text-foreground hover:border-line-strong disabled:opacity-40"
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
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-[color:var(--verris-body)]"
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
              aria-label="Dzień kopii (RRRRMMDD)"
              inputMode="numeric"
              spellCheck={false}
              className="w-48 rounded-md border border-line bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-data focus:outline-none"
            />
            <span className="text-muted-foreground">
              Masz kopię z każdego z ostatnich {KOPIE_OFFSITE_DNI} dni — starszych już nie ma.
            </span>
          </div>
        ) : null}
      </div>

      {state.busy ? (
        <p className="flex items-center gap-2 text-xs text-data-hi">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Serwer pracuje nad kopią off-site… To potrwa chwilę, możesz zostać na tej stronie.
        </p>
      ) : null}
      {error ? <p className="text-xs text-crit">{error}</p> : null}
      {listFailed && !state.busy ? (
        <p className="text-xs text-crit">
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-line bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="break-words font-mono text-xs text-foreground">{archive.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {archive.modifiedAt
                      ? new Date(archive.modifiedAt).toLocaleString('pl-PL')
                      : 'data nieznana'}
                    {archive.sizeBytes ? ` · ${formatBytes(archive.sizeBytes)}` : ''}
                  </p>
                </div>
                {isFetched ? (
                  <span className="inline-flex items-center gap-1 text-xs text-data-hi">
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
                    className="inline-flex items-center gap-2 rounded-[7px] border border-data/28 bg-data-soft px-3 py-1.5 text-xs font-medium text-data-hi hover:bg-data-soft disabled:opacity-40"
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
        <p className="text-xs text-muted-foreground">
          Nie znaleźliśmy archiwów off-site dla tego konta
          {state.snapshot ? ` z dnia ${state.snapshot}` : ''}. Napisz do nas, sprawdzimy to razem.
        </p>
      ) : null}

      {fetchFailed && !state.busy ? (
        <p className="text-xs text-crit">
          {state.lastFetch?.errorMessage ?? 'Pobranie archiwum nie powiodło się.'}
        </p>
      ) : null}

      {state.fetchedArchive && !state.busy ? (
        <p className="flex items-start gap-2 rounded-[7px] border border-data/28 bg-data-soft px-3 py-2 text-xs text-data-hi">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Archiwum <span className="font-mono">{state.fetchedArchive}</span> jest już na serwerze.
            Wybierz je z listy kopii powyżej i kliknij „Przywróć z tej kopii” — poprosimy jeszcze o
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
  return `${liczba(value, value >= 10 ? 0 : 1)} ${units[unit]}`;
}

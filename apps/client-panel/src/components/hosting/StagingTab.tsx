'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import {
  createOrRefreshStaging,
  deleteStagingEnv,
  getStagingEnv,
  pushStagingToLive,
  type StagingEnvStatus,
} from '@/app/dashboard/services/[id]/staging-env-actions';

interface StagingTabProps {
  serviceId: string;
}

/**
 * B5 — staging 1-click. Jedna kopia robocza per usługa (staging.<domena>),
 * trzy akcje: utwórz/odśwież z produkcji, opublikuj na produkcję, usuń.
 * Pliki zawsze; dla WordPressa także baza z automatyczną zamianą adresów.
 */
export default function StagingTab({ serviceId }: StagingTabProps) {
  const [status, setStatus] = useState<StagingEnvStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'create' | 'push' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmPush, setConfirmPush] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getStagingEnv(serviceId);
    setStatus(s);
    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inflight =
    status?.lastTask?.status === 'QUEUED' || status?.lastTask?.status === 'RUNNING';

  // Poll w trakcie operacji na węźle.
  useEffect(() => {
    if (inflight) {
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }
  }, [inflight, refresh]);

  const run = async (
    action: 'create' | 'push' | 'delete',
    fn: () => Promise<StagingEnvStatus | { error: string }>,
  ) => {
    setError(null);
    setBusy(action);
    const res = await fn();
    setBusy(null);
    if ('error' in res) setError(res.error);
    else setStatus(res);
    setConfirmPush(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-sm text-neutral-400">
        Staging będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Box className="h-5 w-5 text-indigo-300" /> Kopia robocza (staging)
        </h3>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Bezpieczna kopia Twojej strony pod adresem{' '}
          <strong className="text-neutral-200">{status.stagingDomain}</strong>. Testuj zmiany,
          aktualizacje i wtyczki bez ryzyka — a gdy wszystko działa,{' '}
          <strong className="text-neutral-200">opublikuj jednym kliknięciem</strong>. Dla
          WordPressa kopiujemy też bazę danych i automatycznie podmieniamy adresy. Przed każdą
          publikacją robimy kopię zapasową produkcji.
        </p>
      </div>

      {inflight && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          {status.lastTask?.direction === 'TO_LIVE'
            ? 'Publikowanie na produkcję… (zwykle do 2 min)'
            : 'Kopiowanie strony na staging… (zwykle do 2 min)'}
        </div>
      )}
      {status.lastTask?.status === 'FAILED' && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Ostatnia operacja nie powiodła się: {status.lastTask.errorMessage ?? 'błąd'} — spróbuj
          ponownie lub napisz do BOK.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!status.exists ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center space-y-4">
          <Box className="h-10 w-10 mx-auto text-neutral-500" />
          <p className="text-sm text-neutral-400 max-w-md mx-auto">
            Nie masz jeszcze kopii roboczej. Utworzymy <code>{status.stagingDomain}</code> i
            skopiujemy tam całą stronę z produkcji.
          </p>
          <button
            type="button"
            disabled={busy !== null || inflight}
            onClick={() => run('create', () => createOrRefreshStaging(serviceId))}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-white"
          >
            {busy === 'create' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4" />
            )}
            Utwórz kopię roboczą
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <a
                  href={status.stagingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-white hover:underline inline-flex items-center gap-1.5"
                >
                  {status.stagingDomain} <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <p className="text-xs text-neutral-400">
                  {status.syncedAt
                    ? `Ostatnia kopia z produkcji: ${new Date(status.syncedAt).toLocaleString('pl-PL')}`
                    : 'Kopiowanie w przygotowaniu…'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={busy !== null || inflight}
              onClick={() => run('create', () => createOrRefreshStaging(serviceId))}
              className="rounded-xl border border-white/10 bg-black/20 hover:border-white/25 disabled:opacity-50 p-4 text-left"
            >
              <RefreshCw className="h-5 w-5 text-sky-300 mb-2" />
              <p className="text-sm font-medium text-white">Odśwież z produkcji</p>
              <p className="text-xs text-neutral-400 mt-1">
                Nadpisz staging aktualną wersją strony. Zmiany na stagingu przepadną.
              </p>
            </button>

            <button
              type="button"
              disabled={busy !== null || inflight}
              onClick={() => setConfirmPush(true)}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 disabled:opacity-50 p-4 text-left"
            >
              <Rocket className="h-5 w-5 text-emerald-300 mb-2" />
              <p className="text-sm font-medium text-white">Opublikuj na produkcję</p>
              <p className="text-xs text-neutral-400 mt-1">
                Wgraj staging na {status.domain}. Najpierw zrobimy backup produkcji.
              </p>
            </button>

            <button
              type="button"
              disabled={busy !== null || inflight}
              onClick={() => run('delete', () => deleteStagingEnv(serviceId))}
              className="rounded-xl border border-white/10 bg-black/20 hover:border-rose-500/40 disabled:opacity-50 p-4 text-left"
            >
              {busy === 'delete' ? (
                <Loader2 className="h-5 w-5 animate-spin text-rose-300 mb-2" />
              ) : (
                <Trash2 className="h-5 w-5 text-rose-300 mb-2" />
              )}
              <p className="text-sm font-medium text-white">Usuń staging</p>
              <p className="text-xs text-neutral-400 mt-1">
                Usuwa subdomenę z plikami. Baza staging zostaje (zakładka Bazy MySQL).
              </p>
            </button>
          </div>

          {confirmPush && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
              <p className="text-sm text-amber-100">
                <strong>Publikacja zastąpi obecną wersję {status.domain}</strong> zawartością
                stagingu (pliki i — dla WordPressa — baza danych). Przed zmianą zapiszemy kopię
                zapasową produkcji na Twoim koncie (<code>~/.verris/backups</code>).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('push', () => pushStagingToLive(serviceId))}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
                >
                  {busy === 'push' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Tak, opublikuj
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPush(false)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-neutral-200 hover:bg-white/5"
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

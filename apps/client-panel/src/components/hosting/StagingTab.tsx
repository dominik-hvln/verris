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
import { SectionHead } from '@/components/panel/v2';
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

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const refresh = useCallback(
    () =>
      getStagingEnv(serviceId).then((s) => {
        setStatus(s);
        setLoading(false);
      }),
    [serviceId],
  );

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
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-[10px] border border-line bg-background p-6 text-sm text-muted-foreground">
        Staging będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHead
        title="Kopia robocza (staging)"
        desc={`Bezpieczna kopia strony pod adresem ${status.stagingDomain}. Testuj zmiany bez ryzyka, a gdy wszystko działa — opublikuj jednym kliknięciem. Dla WordPressa kopiujemy też bazę i podmieniamy adresy; przed publikacją robimy kopię produkcji.`}
      />

      {inflight && (
        <div className="flex items-center gap-2 rounded-[10px] border border-data/28 bg-data-soft px-4 py-3 text-sm text-data-hi">
          <Loader2 className="h-4 w-4 animate-spin" />
          {status.lastTask?.direction === 'TO_LIVE'
            ? 'Publikowanie na produkcję… (zwykle do 2 min)'
            : 'Kopiowanie strony na staging… (zwykle do 2 min)'}
        </div>
      )}
      {status.lastTask?.status === 'FAILED' && (
        <div className="flex items-start gap-2 rounded-[10px] border border-crit/30 bg-crit/12 px-4 py-3 text-sm text-crit">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Ostatnia operacja nie powiodła się: {status.lastTask.errorMessage ?? 'błąd'} — spróbuj
          ponownie lub napisz do BOK.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-crit/30 bg-crit/12 px-4 py-3 text-sm text-crit">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!status.exists ? (
        <div className="rounded-[10px] border border-line bg-background p-8 text-center space-y-4">
          <Box className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Nie masz jeszcze kopii roboczej. Utworzymy <code>{status.stagingDomain}</code> i
            skopiujemy tam całą stronę z produkcji.
          </p>
          <button
            type="button"
            disabled={busy !== null || inflight}
            onClick={() => run('create', () => createOrRefreshStaging(serviceId))}
            className="inline-flex items-center gap-2 rounded-[7px] bg-data-soft hover:bg-data-hi disabled:opacity-50 px-5 py-2.5 text-sm font-medium text-foreground"
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
          <div className="rounded-[10px] border border-data/28 bg-data-soft p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="h-6 w-6 text-data-hi shrink-0" />
              <div className="min-w-0">
                <a
                  href={status.stagingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground underline inline-flex items-center gap-1.5"
                >
                  {status.stagingDomain} <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <p className="text-xs text-muted-foreground">
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
              className="rounded-[10px] border border-line bg-background hover:border-line-strong disabled:opacity-50 p-4 text-left"
            >
              <RefreshCw className="h-5 w-5 text-data-hi mb-2" />
              <p className="text-sm font-medium text-foreground">Odśwież z produkcji</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nadpisz staging aktualną wersją strony. Zmiany na stagingu przepadną.
              </p>
            </button>

            <button
              type="button"
              disabled={busy !== null || inflight}
              onClick={() => setConfirmPush(true)}
              className="rounded-[10px] border border-data/28 bg-data-soft hover:border-data disabled:opacity-50 p-4 text-left"
            >
              <Rocket className="h-5 w-5 text-data-hi mb-2" />
              <p className="text-sm font-medium text-foreground">Opublikuj na produkcję</p>
              <p className="text-xs text-muted-foreground mt-1">
                Wgraj staging na {status.domain}. Najpierw zrobimy backup produkcji.
              </p>
            </button>

            <button
              type="button"
              disabled={busy !== null || inflight}
              onClick={() => run('delete', () => deleteStagingEnv(serviceId))}
              className="rounded-[10px] border border-line bg-background hover:border-crit/30 disabled:opacity-50 p-4 text-left"
            >
              {busy === 'delete' ? (
                <Loader2 className="h-5 w-5 animate-spin text-crit mb-2" />
              ) : (
                <Trash2 className="h-5 w-5 text-crit mb-2" />
              )}
              <p className="text-sm font-medium text-foreground">Usuń staging</p>
              <p className="text-xs text-muted-foreground mt-1">
                Usuwa subdomenę z plikami. Baza staging zostaje (zakładka Bazy MySQL).
              </p>
            </button>
          </div>

          {confirmPush && (
            <div className="rounded-[10px] border border-warn/30 bg-warn-soft p-5 space-y-3">
              <p className="text-sm text-warn">
                <strong>Publikacja zastąpi obecną wersję {status.domain}</strong> zawartością
                stagingu (pliki i — dla WordPressa — baza danych). Przed zmianą zapiszemy kopię
                zapasową produkcji na Twoim koncie (<code>~/.verris/backups</code>).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('push', () => pushStagingToLive(serviceId))}
                  className="inline-flex items-center gap-2 rounded-[7px] bg-primary text-primary-foreground font-semibold hover:bg-data-hi disabled:opacity-50 px-4 py-2 text-sm font-medium"
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
                  className="rounded-[7px] border border-line-strong px-4 py-2 text-sm text-[color:var(--verris-body)] hover:bg-raised"
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

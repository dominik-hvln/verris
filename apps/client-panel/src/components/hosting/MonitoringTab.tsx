'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownCircle,
  CheckCircle2,
  HeartPulse,
  Loader2,
} from 'lucide-react';
import {
  getMonitoringStatus,
  setMonitoringEnabled,
  type MonitoringStatus,
} from '@/app/dashboard/services/[id]/monitoring-actions';

interface Props {
  serviceId: string;
}

/** B3 — monitoring strony: jeden przełącznik, status na żywo, historia awarii. */
export default function MonitoringTab({ serviceId }: Props) {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await getMonitoringStatus(serviceId);
    setStatus(s);
    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Odświeżaj status co 30 s, gdy monitoring włączony.
  useEffect(() => {
    if (status?.enabled) {
      const t = setInterval(refresh, 30_000);
      return () => clearInterval(t);
    }
  }, [status?.enabled, refresh]);

  const onToggle = async () => {
    if (!status) return;
    setError(null);
    setSaving(true);
    const res = await setMonitoringEnabled(serviceId, !status.enabled);
    setSaving(false);
    if ('error' in res) setError(res.error);
    else setStatus(res);
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
        Monitoring będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Przełącznik — jedyna decyzja klienta */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-indigo-300" /> Monitoring strony
            </h3>
            <p className="text-sm text-neutral-400 max-w-xl">
              Sprawdzamy <strong className="text-neutral-200">{status.domain}</strong> co minutę.
              Gdy strona przestanie odpowiadać, <strong className="text-neutral-200">wyślemy
              Ci e-mail</strong> — i drugi, gdy wróci do działania. Bez konfiguracji.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            disabled={saving}
            role="switch"
            aria-checked={status.enabled}
            className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              status.enabled ? 'bg-emerald-500' : 'bg-white/15'
            }`}
            style={{ width: 52 }}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                status.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>

      {/* Status na żywo */}
      {status.enabled && (
        <div
          className={`rounded-2xl border p-6 ${
            status.lastStatus === 'UP'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : status.lastStatus === 'DOWN'
                ? 'border-rose-500/30 bg-rose-500/5'
                : 'border-white/10 bg-black/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {status.lastStatus === 'UP' && <CheckCircle2 className="h-8 w-8 text-emerald-400" />}
            {status.lastStatus === 'DOWN' && <ArrowDownCircle className="h-8 w-8 text-rose-400" />}
            {status.lastStatus === 'UNKNOWN' && <Activity className="h-8 w-8 text-neutral-400" />}
            <div>
              <p className="text-lg font-semibold text-white">
                {status.lastStatus === 'UP' && 'Strona działa'}
                {status.lastStatus === 'DOWN' && 'Strona nie odpowiada'}
                {status.lastStatus === 'UNKNOWN' && 'Czekam na pierwsze sprawdzenie…'}
              </p>
              <p className="text-xs text-neutral-400">
                {status.lastStatus === 'DOWN' && status.downSince
                  ? `Od ${new Date(status.downSince).toLocaleString('pl-PL')} · ${status.lastError ?? ''}`
                  : status.lastCheckedAt
                    ? `Ostatnie sprawdzenie: ${new Date(status.lastCheckedAt).toLocaleTimeString('pl-PL')}${
                        status.lastHttpStatus ? ` (HTTP ${status.lastHttpStatus})` : ''
                      }`
                    : 'Pierwszy wynik pojawi się w ciągu minuty.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* B3+ — dostępność z 30 dni (realne dane z monitoringu) */}
      {status.enabled && status.uptime && (
        <UptimeCard uptime={status.uptime} />
      )}

      {/* Historia awarii */}
      {status.enabled && status.events.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h4 className="text-sm font-semibold text-white mb-3">Ostatnie zdarzenia</h4>
          <ul className="space-y-2">
            {status.events.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 text-sm">
                {e.type === 'DOWN' ? (
                  <ArrowDownCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                )}
                <span className="text-neutral-300">
                  {e.type === 'DOWN' ? (
                    <>
                      Awaria — {e.message ?? (e.httpStatus ? `HTTP ${e.httpStatus}` : 'brak odpowiedzi')}
                    </>
                  ) : (
                    <>
                      Przywrócono
                      {e.durationS
                        ? ` po ${e.durationS >= 3600 ? `${Math.floor(e.durationS / 3600)} h ` : ''}${Math.max(1, Math.round((e.durationS % 3600) / 60))} min`
                        : ''}
                    </>
                  )}
                  <span className="text-neutral-500">
                    {' '}
                    · {new Date(e.createdAt).toLocaleString('pl-PL')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.enabled && status.events.length === 0 && status.lastStatus === 'UP' && (
        <p className="flex items-center gap-2 text-sm text-neutral-500 px-1">
          <AlertCircle className="h-4 w-4" /> Brak awarii w historii — oby tak dalej.
        </p>
      )}
    </div>
  );
}

function formatDowntime(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.max(1, Math.round((seconds % 3600) / 60));
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** B3+ — karta dostępności (uptime) z realnych zdarzeń monitoringu. */
function UptimeCard({
  uptime,
}: {
  uptime: NonNullable<MonitoringStatus['uptime']>;
}) {
  const pct = Number.parseFloat(uptime.pct);
  // Próg „bardzo dobrze" — informacyjny, nie obietnica SLA dla strony klienta.
  const good = pct >= 99.9;
  const ok = pct >= 99 && pct < 99.9;
  const tone = good
    ? { ring: 'border-emerald-500/30 bg-emerald-500/5', text: 'text-emerald-300' }
    : ok
      ? { ring: 'border-amber-400/30 bg-amber-400/5', text: 'text-amber-300' }
      : { ring: 'border-rose-500/30 bg-rose-500/5', text: 'text-rose-300' };

  return (
    <div className={`rounded-2xl border p-6 ${tone.ring}`}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            Dostępność{' '}
            {uptime.measuredFullWindow
              ? `(ostatnie ${uptime.windowDays} dni)`
              : 'od początku monitorowania'}
          </p>
          <p className={`mt-1 text-4xl font-bold ${tone.text}`}>{uptime.pct}%</p>
        </div>
        <div className="text-right text-xs text-neutral-400 space-y-0.5">
          <p>
            Niedostępność:{' '}
            <span className="text-neutral-200">{formatDowntime(uptime.downtimeSeconds)}</span>
          </p>
          <p>
            Awarie w okresie:{' '}
            <span className="text-neutral-200">{uptime.incidents}</span>
          </p>
        </div>
      </div>
      {!uptime.measuredFullWindow && (
        <p className="mt-3 text-[11px] text-neutral-500">
          Monitorujemy od {new Date(uptime.sinceIso).toLocaleDateString('pl-PL')}. Pełne 30 dni
          pokażemy, gdy uzbiera się więcej danych.
        </p>
      )}
    </div>
  );
}

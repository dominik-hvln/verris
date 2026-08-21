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
import { Zap, Loader2 as Loader, ShieldCheck } from 'lucide-react';
import {
  getMonitoringStatus,
  setMonitoringEnabled,
  setMonitoringNotify,
  setPaidMonitoring,
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
                      }${status.lastResponseMs != null ? ` · odpowiedź ${status.lastResponseMs} ms` : ''}`
                    : 'Pierwszy wynik pojawi się w ciągu minuty.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MON-6 — powiadomienia e-mail (monitoring działa niezależnie) */}
      {status.enabled && (
        <NotifyToggle serviceId={serviceId} notifyEmail={status.notifyEmail} onChange={setStatus} />
      )}

      {/* MON-5 — wygasanie certyfikatu SSL */}
      {status.enabled && status.tlsExpiresAt && <SslLine tlsExpiresAt={status.tlsExpiresAt} />}

      {/* B3+ — dostępność z 30 dni (realne dane z monitoringu) */}
      {status.enabled && status.uptime && (
        <UptimeCard uptime={status.uptime} />
      )}

      {/* MON-3 — płatny tier: szybsze sprawdzanie */}
      {status.enabled && (
        <PaidMonitoringCard
          serviceId={serviceId}
          paid={status.paid}
          onChange={setStatus}
        />
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

/** MON-3 — upsell/zarządzanie płatnym monitoringiem (szybkie sprawdzanie). */
function PaidMonitoringCard({
  serviceId,
  paid,
  onChange,
}: {
  serviceId: string;
  paid: NonNullable<MonitoringStatus['paid']>;
  onChange: (s: MonitoringStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nie pokazuj upsellu, gdy admin wyłączył ofertę i klient nie ma płatnego.
  if (!paid.offered && !paid.active) return null;

  const act = async (enabled: boolean) => {
    setError(null);
    setBusy(true);
    const res = await setPaidMonitoring(serviceId, enabled);
    setBusy(false);
    if ('error' in res) setError(res.error);
    else onChange(res);
  };

  const nextDate = paid.nextChargeAt
    ? new Date(paid.nextChargeAt).toLocaleDateString('pl-PL')
    : null;

  if (paid.active) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Zap className="h-4 w-4 text-amber-300" /> Szybki monitoring aktywny
            </h4>
            <p className="text-sm text-neutral-300 max-w-xl">
              Sprawdzamy stronę co {paid.paidIntervalMinutes === 1 ? 'minutę' : `${paid.paidIntervalMinutes} min`} —
              awarię wykryjemy niemal natychmiast.
              {paid.cancelAtPeriodEnd
                ? nextDate
                  ? ` Rezygnacja zaplanowana: szybki tryb działa do ${nextDate}, potem wraca standardowy (co ${paid.freeIntervalMinutes} min).`
                  : ' Rezygnacja zaplanowana — wróci tryb standardowy.'
                : nextDate
                  ? ` Następna opłata: ${nextDate} (${paid.monthlyPrice} K/mies.).`
                  : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => act(!paid.cancelAtPeriodEnd ? false : true)}
            disabled={busy}
            className="shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? <Loader className="h-4 w-4 animate-spin" /> : paid.cancelAtPeriodEnd ? 'Wznów' : 'Zrezygnuj'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Zap className="h-4 w-4 text-amber-300" /> Przyspiesz monitoring
          </h4>
          <p className="text-sm text-neutral-400 max-w-xl">
            Standardowo sprawdzamy stronę co {paid.freeIntervalMinutes} min (za darmo). Włącz
            szybki monitoring, by sprawdzać co{' '}
            {paid.paidIntervalMinutes === 1 ? 'minutę' : `${paid.paidIntervalMinutes} min`} i wykrywać
            awarie niemal natychmiast — <strong className="text-neutral-200">{paid.monthlyPrice} K/mies.</strong> z portfela.
          </p>
        </div>
        <button
          type="button"
          onClick={() => act(true)}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Włącz za {paid.monthlyPrice} K/mies.
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/** MON-6 — przełącznik powiadomień e-mail (bez wyłączania monitoringu). */
function NotifyToggle({
  serviceId,
  notifyEmail,
  onChange,
}: {
  serviceId: string;
  notifyEmail: boolean;
  onChange: (s: MonitoringStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    const res = await setMonitoringNotify(serviceId, !notifyEmail);
    setBusy(false);
    if (!('error' in res)) onChange(res);
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-white">Powiadomienia e-mail o awariach i SSL</p>
        <p className="text-xs text-neutral-500">
          {notifyEmail
            ? 'Wyślemy maila przy awarii, powrocie i zbliżającym się wygaśnięciu certyfikatu.'
            : 'Maile wyłączone — monitoring działa, ale nie powiadamiamy mailem.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        role="switch"
        aria-checked={notifyEmail}
        className={`relative inline-flex h-7 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          notifyEmail ? 'bg-emerald-500' : 'bg-white/15'
        }`}
        style={{ width: 52 }}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            notifyEmail ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/** MON-5 — linia statusu certyfikatu SSL z dni do wygaśnięcia. */
function SslLine({ tlsExpiresAt }: { tlsExpiresAt: string }) {
  const exp = new Date(tlsExpiresAt);
  const daysLeft = Math.floor((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const expired = daysLeft <= 0;
  const soon = daysLeft <= 14;
  const tone = expired
    ? 'border-rose-500/30 bg-rose-500/5 text-rose-200'
    : soon
      ? 'border-amber-400/30 bg-amber-400/5 text-amber-200'
      : 'border-white/10 bg-black/20 text-neutral-300';
  const label = expired
    ? 'Certyfikat SSL wygasł'
    : daysLeft === 1
      ? 'Certyfikat SSL wygaśnie jutro'
      : `Certyfikat SSL ważny jeszcze ${daysLeft} dni`;
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      <ShieldCheck className="h-4 w-4 shrink-0" />
      <span>
        {label} <span className="text-neutral-500">· do {exp.toLocaleDateString('pl-PL')}</span>
      </span>
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

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Zap, Loader2 as Loader } from 'lucide-react';
import { Kpi, KpiStrip, Meter, SectionHead, Switch } from '@/components/panel/v2';
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

  // Chwila ostatniego odczytu — z niej liczymy dni do końca certyfikatu (Date.now() w renderze byłby nieczysty).
  const [checkedAt, setCheckedAt] = useState(0);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const refresh = useCallback(
    () =>
      getMonitoringStatus(serviceId).then((s) => {
        setStatus(s);
        setCheckedAt(Date.now());
        setLoading(false);
      }),
    [serviceId],
  );

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
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-[10px] border border-line bg-background p-6 text-sm text-muted-foreground">
        Monitoring będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHead
        title="Monitoring strony"
        desc={`Sprawdzamy ${status.domain} co minutę. Gdy strona przestanie odpowiadać, wyślemy e-mail — i drugi, gdy wróci.`}
        action={<Switch checked={status.enabled} onChange={onToggle} disabled={saving} label="Monitoring strony" />}
      />
      {error ? <p className="text-sm text-crit">{error}</p> : null}

      {status.enabled ? (
        <KpiStrip>
          <Kpi
            label="Stan strony"
            value={status.lastStatus === 'UP' ? 'Działa' : status.lastStatus === 'DOWN' ? 'Nie działa' : 'Czekamy'}
            foot={
              <span>
                {status.lastStatus === 'DOWN' && status.downSince
                  ? `od ${new Date(status.downSince).toLocaleString('pl-PL')}`
                  : status.lastCheckedAt
                    ? `sprawdzono ${new Date(status.lastCheckedAt).toLocaleTimeString('pl-PL')}${status.lastHttpStatus ? ` · HTTP ${status.lastHttpStatus}` : ''}`
                    : 'pierwszy wynik w ciągu minuty'}
              </span>
            }
          />
          <Kpi
            label="Czas odpowiedzi"
            value={status.lastResponseMs ?? '—'}
            unit={status.lastResponseMs != null ? 'ms' : undefined}
            foot={<span>z ostatniego sprawdzenia</span>}
          />
          <Kpi
            label="Dostępność"
            value={status.uptime ? Number(status.uptime.pct).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) : '—'}
            unit={status.uptime ? '%' : undefined}
            foot={
              <span>
                {status.uptime
                  ? `${status.uptime.measuredFullWindow ? `ostatnie ${status.uptime.windowDays} dni` : `od ${new Date(status.uptime.sinceIso).toLocaleDateString('pl-PL')}`} · ${status.uptime.incidents} przerw`
                  : 'liczymy od pierwszego pomiaru'}
              </span>
            }
          >
            {status.uptime ? <Meter pct={Number(status.uptime.pct)} tone={Number(status.uptime.pct) >= 99.5 ? 'data' : 'warn'} /> : null}
          </Kpi>
          <Kpi
            label="Certyfikat SSL"
            value={status.tlsExpiresAt ? Math.max(0, Math.ceil((new Date(status.tlsExpiresAt).getTime() - checkedAt) / 86_400_000)) : '—'}
            unit={status.tlsExpiresAt ? 'dni' : undefined}
            foot={<span>{status.tlsExpiresAt ? `do ${new Date(status.tlsExpiresAt).toLocaleDateString('pl-PL')}` : 'brak danych o certyfikacie'}</span>}
          />
        </KpiStrip>
      ) : null}

      {/* MON-6 — powiadomienia e-mail (monitoring działa niezależnie) */}
      {status.enabled && (
        <NotifyToggle serviceId={serviceId} notifyEmail={status.notifyEmail} onChange={setStatus} />
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
        <div className="rounded-[10px] border border-line bg-background p-6">
          <h4 className="text-sm font-semibold text-foreground mb-3">Ostatnie zdarzenia</h4>
          <ul className="space-y-2">
            {status.events.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 text-sm">
                {e.type === 'DOWN' ? (
                  <ArrowDownCircle className="h-4 w-4 shrink-0 mt-0.5 text-crit" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-data-hi" />
                )}
                <span className="text-[color:var(--verris-body)]">
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
                  <span className="text-muted-foreground">
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
        <p className="flex items-center gap-2 text-sm text-muted-foreground px-1">
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
      <div className="rounded-[10px] border border-warn/30 bg-warn-soft p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="h-4 w-4 text-warn" /> Szybki monitoring aktywny
            </h4>
            <p className="text-sm text-[color:var(--verris-body)] max-w-xl">
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
            className="shrink-0 rounded-[7px] border border-line-strong bg-raised px-4 py-2 text-sm font-medium text-foreground hover:bg-raised disabled:opacity-50"
          >
            {busy ? <Loader className="h-4 w-4 animate-spin" /> : paid.cancelAtPeriodEnd ? 'Wznów' : 'Zrezygnuj'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-crit">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-line bg-background p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 text-warn" /> Przyspiesz monitoring
          </h4>
          <p className="text-sm text-muted-foreground max-w-xl">
            Standardowo sprawdzamy stronę co {paid.freeIntervalMinutes} min (za darmo). Włącz
            szybki monitoring, by sprawdzać co{' '}
            {paid.paidIntervalMinutes === 1 ? 'minutę' : `${paid.paidIntervalMinutes} min`} i wykrywać
            awarie niemal natychmiast — <strong className="text-[color:var(--verris-body)]">{paid.monthlyPrice} K/mies.</strong> z portfela.
          </p>
        </div>
        <button
          type="button"
          onClick={() => act(true)}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-2 rounded-[7px] bg-warn-soft px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-warn-soft disabled:opacity-50"
        >
          {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Włącz za {paid.monthlyPrice} K/mies.
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-crit">{error}</p>}
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
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">Powiadomienia e-mail o awariach i SSL</p>
        <p className="text-xs text-muted-foreground">
          {notifyEmail
            ? 'Wyślemy maila przy awarii, powrocie i zbliżającym się wygaśnięciu certyfikatu.'
            : 'Maile wyłączone — monitoring działa, ale nie powiadamiamy mailem.'}
        </p>
      </div>
      <Switch checked={notifyEmail} onChange={() => void toggle()} disabled={busy} label="Powiadomienia e-mail o awarii" />
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield, ShieldCheck, ShieldOff, AlertCircle, Eye } from 'lucide-react';
import {
  getWafStatus,
  setWafMode,
  type WafMode,
  type WafStatus,
} from '@/app/dashboard/services/[id]/waf-actions';

interface Props {
  serviceId: string;
}

const MODES: Array<{
  id: WafMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  {
    id: 'ON',
    label: 'Włączony (blokowanie)',
    desc: 'Ataki (SQLi, XSS, RCE…) są blokowane na podstawie reguł OWASP CRS. Zalecane dla większości stron.',
    icon: ShieldCheck,
    accent: 'border-emerald-400/40 bg-emerald-400/10',
  },
  {
    id: 'DETECTION',
    label: 'Tryb detekcji (tylko log)',
    desc: 'Podejrzane żądania są logowane, ale nie blokowane. Dobre na start i do diagnozowania fałszywych alarmów.',
    icon: Eye,
    accent: 'border-amber-400/40 bg-amber-400/10',
  },
  {
    id: 'OFF',
    label: 'Wyłączony',
    desc: 'Brak ochrony WAF. Używaj tylko, jeśli reguły kolidują z aplikacją (np. nietypowe wtyczki).',
    icon: ShieldOff,
    accent: 'border-rose-400/40 bg-rose-400/10',
  },
];

export default function WafTab({ serviceId }: Props) {
  const [status, setStatus] = useState<WafStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<WafMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await getWafStatus(serviceId);
    setStatus(s);
    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while applying.
  useEffect(() => {
    if (
      status?.lastTask &&
      (status.lastTask.status === 'QUEUED' || status.lastTask.status === 'RUNNING')
    ) {
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }
  }, [status, refresh]);

  const onSet = async (mode: WafMode) => {
    if (mode === status?.mode) return;
    setError(null);
    setSaving(mode);
    const res = await setWafMode(serviceId, mode);
    setSaving(null);
    if ('error' in res) {
      setError(res.error);
    } else {
      setStatus(res);
    }
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
        WAF będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  const applying =
    status.lastTask?.status === 'QUEUED' || status.lastTask?.status === 'RUNNING';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-300" /> Web Application Firewall (ModSecurity)
        </h3>
        <p className="text-sm text-neutral-400">
          Zapora aplikacyjna z regułami <strong className="text-neutral-200">OWASP Core Rule
          Set</strong> chroni <strong className="text-neutral-200">{status.domain}</strong> przed
          najczęstszymi atakami: SQL injection, XSS, próbami przejęcia sesji i skanerami luk.
          Zmiana trybu działa do ~1 minuty.
        </p>
        {applying && (
          <p className="inline-flex items-center gap-1.5 text-xs text-sky-300">
            <Loader2 className="h-3 w-3 animate-spin" /> Stosowanie zmian na serwerze…
          </p>
        )}
        {status.lastTask?.status === 'FAILED' && (
          <p className="inline-flex items-start gap-1.5 text-xs text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Ostatnia zmiana nie powiodła się: {status.lastTask.errorMessage ?? 'błąd'} — spróbuj
            ponownie lub skontaktuj się z BOK.
          </p>
        )}
      </div>

      <div className="grid gap-3">
        {MODES.map((m) => {
          const active = status.mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              disabled={saving !== null || applying}
              onClick={() => onSet(m.id)}
              className={`text-left rounded-xl border p-4 transition-colors disabled:opacity-60 ${
                active ? m.accent : 'border-white/10 bg-black/20 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <Icon className="h-5 w-5 text-neutral-200" />
                  <span className="text-sm font-medium text-white">{m.label}</span>
                </span>
                {active ? (
                  <span className="text-xs rounded-full border border-white/20 px-2 py-0.5 text-neutral-200">
                    aktywny{status.appliedAt ? '' : ' (oczekuje)'}
                  </span>
                ) : saving === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Wskazówka: po przejściu z trybu detekcji na blokowanie obserwuj stronę przez 1-2 dni. Jeśli
        prawidłowe żądania są blokowane (np. zapis w edytorze wtyczki), przełącz na tryb detekcji i
        zgłoś to do BOK — dostroimy reguły dla Twojej domeny.
      </p>
    </div>
  );
}

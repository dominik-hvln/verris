'use client';

import { MalwarePanel } from '@/components/hosting/MalwarePanel';
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff, AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { SectionHead } from '@/components/panel/v2';
import { BLAD_ODCZYTU_WAF } from '@/lib/waf';
import {
  getWafStatus,
  setWafMode,
  type OdczytWaf,
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
    desc: 'Ataki (SQL injection, XSS, zdalne wykonanie kodu…) są blokowane przez reguły zapory. Zalecane dla większości stron.',
    icon: ShieldCheck,
    accent: 'border-data/28 bg-data-soft',
  },
  {
    id: 'DETECTION',
    label: 'Tryb detekcji (tylko log)',
    desc: 'Podejrzane żądania są logowane, ale nie blokowane. Dobre na start i do diagnozowania fałszywych alarmów.',
    icon: Eye,
    accent: 'border-warn/30 bg-warn-soft',
  },
  {
    id: 'OFF',
    label: 'Wyłączony',
    desc: 'Brak ochrony WAF. Używaj tylko, jeśli reguły kolidują z aplikacją (np. nietypowe wtyczki).',
    icon: ShieldOff,
    accent: 'border-crit/30 bg-crit/12',
  },
];

export default function WafTab({ serviceId }: Props) {
  const [status, setStatus] = useState<WafStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<WafMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brakKonta, setBrakKonta] = useState(false);
  /** Noc 11→12.10 — błąd odczytu nie udaje „braku konta” i nie kasuje ostatniego stanu (odpytywanie trwa dalej). */
  const [bladOdczytu, setBladOdczytu] = useState<string | null>(null);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const refresh = useCallback(
    () =>
      getWafStatus(serviceId)
        // Akcja serwera po wdrożeniu (stara karta) albo zerwane połączenie — odrzucenie zamiast wyniku.
        .catch((): OdczytWaf => ({ ok: false, brakKonta: false, error: BLAD_ODCZYTU_WAF }))
        .then((r) => {
          if (r.ok) {
            setStatus(r.status);
            setBladOdczytu(null);
          } else if (r.brakKonta) {
            setStatus(null);
            setBrakKonta(true);
          } else {
            setBladOdczytu(r.error);
          }
          setLoading(false);
        }),
    [serviceId],
  );

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
    const res = await setWafMode(serviceId, mode).catch(() => ({ error: 'Nie udało się zmienić trybu — spróbuj ponownie.' }));
    setSaving(null);
    if ('error' in res) {
      setError(res.error);
    } else {
      setStatus(res);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  const ponow = (
    <button
      type="button"
      data-akcja="ponow-odczyt-waf"
      onClick={() => {
        setLoading(true);
        void refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-raised"
    >
      <RefreshCw className="h-3.5 w-3.5" /> Spróbuj ponownie
    </button>
  );

  if (!status) {
    if (!brakKonta) {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-crit/30 bg-crit/12 p-4 text-sm text-crit">
          <AlertCircle className="h-4 w-4" /> {bladOdczytu ?? BLAD_ODCZYTU_WAF} {ponow}
        </div>
      );
    }
    return (
      <div className="rounded-[10px] border border-line bg-background p-6 text-sm text-muted-foreground">
        WAF będzie dostępny po aktywacji konta hostingowego.
      </div>
    );
  }

  const applying =
    status.lastTask?.status === 'QUEUED' || status.lastTask?.status === 'RUNNING';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SectionHead
          title="Zapora aplikacji (WAF)"
          desc={`Reguły zapory chronią ${status.domain} przed najczęstszymi atakami: SQL injection, XSS, przejęciem sesji i skanerami luk. Zmiana trybu działa w ciągu minuty.`}
        />
        {bladOdczytu && (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-crit">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Nie udało się odświeżyć stanu zapory — pokazany stan może być nieaktualny. {ponow}
          </p>
        )}
        {applying && (
          <p className="inline-flex items-center gap-1.5 text-xs text-data-hi">
            <Loader2 className="h-3 w-3 animate-spin" /> Stosowanie zmian na serwerze…
          </p>
        )}
        {status.lastTask?.status === 'FAILED' && (
          <p className="inline-flex items-start gap-1.5 text-xs text-crit">
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
              className={`text-left rounded-[10px] border p-4 transition-colors disabled:opacity-60 ${
                active ? m.accent : 'border-line bg-background hover:border-line-strong'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <Icon className="h-5 w-5 text-[color:var(--verris-body)]" />
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                </span>
                {active ? (
                  <span className="text-xs rounded-full border border-line-strong px-2 py-0.5 text-[color:var(--verris-body)]">
                    aktywny{status.appliedAt ? '' : ' (oczekuje)'}
                  </span>
                ) : saving === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[color:var(--verris-body)]" />
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-crit/30 bg-crit/12 px-4 py-3 text-sm text-crit">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <MalwarePanel serviceId={serviceId} />

      <p className="text-xs text-muted-foreground">
        Wskazówka: po przejściu z trybu detekcji na blokowanie obserwuj stronę przez 1-2 dni. Jeśli
        prawidłowe żądania są blokowane (np. zapis w edytorze wtyczki), przełącz na tryb detekcji i
        zgłoś to do BOK — dostroimy reguły dla Twojej domeny.
      </p>
    </div>
  );
}

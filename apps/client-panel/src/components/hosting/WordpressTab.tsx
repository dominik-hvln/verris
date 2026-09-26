'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Check, Copy, ExternalLink, Globe } from 'lucide-react';
import {
  getWordpressStatus,
  installWordpress,
  type WordpressInstallResult,
  type WordpressStatus,
} from '@/app/dashboard/services/[id]/wordpress-actions';

interface Props {
  serviceId: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: 'W kolejce', cls: 'border-warn/30 bg-warn-soft text-warn' },
  RUNNING: { label: 'Instalacja w toku', cls: 'border-data/28 bg-data-soft text-data-hi' },
  COMPLETED: { label: 'Zainstalowany', cls: 'border-data/28 bg-data-soft text-data-hi' },
  FAILED: { label: 'Błąd', cls: 'border-crit/30 bg-crit/12 text-crit' },
};

export default function WordpressTab({ serviceId }: Props) {
  const [status, setStatus] = useState<WordpressStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteTitle, setSiteTitle] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WordpressInstallResult | null>(null);
  const [copied, setCopied] = useState(false);

  // `.then` zamiast `await` — lint React Compilera nie widzi `await` w useCallback i zgłasza fałszywy setState w efekcie.
  const refresh = useCallback(
    () =>
      getWordpressStatus(serviceId).then((s) => {
        setStatus(s);
        setLoading(false);
      }),
    [serviceId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while a task is in flight.
  useEffect(() => {
    if (status?.task && (status.task.status === 'QUEUED' || status.task.status === 'RUNNING')) {
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }
  }, [status, refresh]);

  const onInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await installWordpress(serviceId, {
      siteTitle: siteTitle.trim(),
      adminUser: adminUser.trim(),
      adminEmail: adminEmail.trim(),
    });
    setSubmitting(false);
    if ('ok' in res && res.ok) {
      setResult(res);
      await refresh();
    } else {
      setError(res.error);
    }
  };

  const inflight =
    status?.task?.status === 'QUEUED' || status?.task?.status === 'RUNNING';
  const installed = status?.task?.status === 'COMPLETED';

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[10px] border border-line bg-background p-6 space-y-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="h-5 w-5 text-data-hi" /> WordPress — instalacja jednym kliknięciem
        </h3>
        <p className="text-sm text-muted-foreground">
          Postawimy WordPressa na <strong className="text-[color:var(--verris-body)]">{status?.domain}</strong> —
          z bazą danych, ładnymi linkami i wtyczką LiteSpeed Cache. Zajmie ~1 minutę.
        </p>
      </div>

      {status?.task && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-background px-4 py-3">
          <span className="text-sm text-[color:var(--verris-body)]">
            Ostatnia instalacja: {new Date(status.task.createdAt).toLocaleString('pl-PL')}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${STATUS_LABEL[status.task.status]?.cls ?? ''}`}
          >
            {inflight && <Loader2 className="h-3 w-3 animate-spin" />}
            {STATUS_LABEL[status.task.status]?.label ?? status.task.status}
          </span>
        </div>
      )}

      {status?.task?.status === 'FAILED' && status.task.errorMessage && (
        <div className="flex items-start gap-2 rounded-[10px] border border-crit/30 bg-crit/12 px-4 py-3 text-sm text-crit">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {status.task.errorMessage}
        </div>
      )}

      {installed && !result && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-data/28 bg-data-soft px-4 py-3">
          <span className="text-sm text-data-hi">WordPress jest zainstalowany.</span>
          <a
            href={`https://${status?.domain}/wp-admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-data-hi underline"
          >
            Otwórz wp-admin <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {result && (
        <div className="rounded-[10px] border border-data/28 bg-data-soft p-4 space-y-2">
          <p className="text-sm font-medium text-data-hi">Instalacja rozpoczęta!</p>
          <p className="text-xs text-[color:var(--verris-body)]">{result.note}</p>
          <div className="rounded-[7px] bg-background p-3 text-sm font-mono space-y-1">
            <div>URL: <a className="text-data-hi" href={result.adminUrl} target="_blank" rel="noopener noreferrer">{result.adminUrl}</a></div>
            <div>Login: {result.adminUser}</div>
            <div className="flex items-center gap-2">
              Hasło: <span className="text-warn">{result.adminPassword}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(result.adminPassword).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-line hover:bg-raised"
              >
                {copied ? <Check className="h-3 w-3 text-data-hi" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {!inflight && (
        <form onSubmit={onInstall} className="rounded-[10px] border border-line bg-background p-6 space-y-4">
          <p className="text-sm font-medium text-foreground">
            {installed ? 'Zainstaluj ponownie / na nowo' : 'Nowa instalacja'}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Tytuł witryny">
              <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} required placeholder="Moja strona" className="wp-input" />
            </Field>
            <Field label="Login administratora">
              <input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} required placeholder="admin" className="wp-input" />
            </Field>
            <Field label="E-mail administratora">
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="ty@firma.pl" className="wp-input" />
            </Field>
          </div>
          {installed && (
            <p className="text-xs text-warn">
              Uwaga: ponowna instalacja nadpisze konfigurację, jeśli WordPress nie jest jeszcze
              skonfigurowany. Jeśli jest — operacja zostanie pominięta (bez utraty danych).
            </p>
          )}
          {error && <p className="text-sm text-crit">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-[7px] bg-data-soft hover:bg-data-hi disabled:opacity-50 px-4 py-2 text-sm font-medium text-foreground"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Zainstaluj WordPress
          </button>
        </form>
      )}

      <style>{`
        .wp-input { width: 100%; border-radius: 0.5rem; background: rgb(255 255 255 / 0.05); border: 1px solid rgb(255 255 255 / 0.1); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: white; outline: none; }
        .wp-input:focus { border-color: rgb(99 102 241 / 0.6); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

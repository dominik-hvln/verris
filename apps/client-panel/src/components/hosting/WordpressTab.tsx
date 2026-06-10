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
  QUEUED: { label: 'W kolejce', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  RUNNING: { label: 'Instalacja w toku', cls: 'border-sky-400/30 bg-sky-400/10 text-sky-200' },
  COMPLETED: { label: 'Zainstalowany', cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' },
  FAILED: { label: 'Błąd', cls: 'border-rose-400/30 bg-rose-400/10 text-rose-200' },
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

  const refresh = useCallback(async () => {
    const s = await getWordpressStatus(serviceId);
    setStatus(s);
    setLoading(false);
  }, [serviceId]);

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
      <div className="flex items-center gap-2 text-sm text-neutral-400 p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-indigo-300" /> WordPress — instalacja jednym kliknięciem
        </h3>
        <p className="text-sm text-neutral-400">
          Postawimy WordPressa na <strong className="text-neutral-200">{status?.domain}</strong> —
          z bazą danych, ładnymi linkami i wtyczką LiteSpeed Cache. Zajmie ~1 minutę.
        </p>
      </div>

      {status?.task && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <span className="text-sm text-neutral-300">
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
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {status.task.errorMessage}
        </div>
      )}

      {installed && !result && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <span className="text-sm text-emerald-200">WordPress jest zainstalowany.</span>
          <a
            href={`https://${status?.domain}/wp-admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-300 hover:underline"
          >
            Otwórz wp-admin <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-sm font-medium text-emerald-200">Instalacja rozpoczęta!</p>
          <p className="text-xs text-neutral-300">{result.note}</p>
          <div className="rounded-lg bg-black/40 p-3 text-sm font-mono space-y-1">
            <div>URL: <a className="text-indigo-300" href={result.adminUrl} target="_blank" rel="noopener noreferrer">{result.adminUrl}</a></div>
            <div>Login: {result.adminUser}</div>
            <div className="flex items-center gap-2">
              Hasło: <span className="text-amber-200">{result.adminPassword}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(result.adminPassword).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/5"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {!inflight && (
        <form onSubmit={onInstall} className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
          <p className="text-sm font-medium text-white">
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
            <p className="text-xs text-amber-300">
              Uwaga: ponowna instalacja nadpisze konfigurację, jeśli WordPress nie jest jeszcze
              skonfigurowany. Jeśli jest — operacja zostanie pominięta (bez utraty danych).
            </p>
          )}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
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
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

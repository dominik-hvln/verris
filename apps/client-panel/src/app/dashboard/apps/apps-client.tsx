'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Boxes, Check, Copy, Loader2 } from 'lucide-react';
import { installAppAction, type AppsStatus, type AppInstallResult } from './apps-actions';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'W kolejce',
  RUNNING: 'Instalacja…',
  COMPLETED: 'Zainstalowano',
  FAILED: 'Błąd',
};

export function AppsClient({ serviceId, status }: { serviceId: string; status: AppsStatus }) {
  const router = useRouter();
  const [app, setApp] = useState('');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [result, setResult] = useState<AppInstallResult | null>(null);
  const [pending, startTransition] = useTransition();

  const inflight = status.installs.some((i) => i.status === 'QUEUED' || i.status === 'RUNNING');

  const install = () => {
    if (!app) {
      toast.error('Wybierz aplikację.');
      return;
    }
    startTransition(async () => {
      const res = await installAppAction(serviceId, { app, adminUser: adminUser.trim(), adminEmail: adminEmail.trim() });
      if (!res.ok) {
        toast.error('Nie udało się rozpocząć instalacji', { description: res.error });
        return;
      }
      toast.success('Instalacja rozpoczęta');
      setResult(res.data);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {result ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-100">
            {result.app} instaluje się na <span className="font-mono">{result.domain}</span>. Zapisz dane —
            pokazujemy je tylko raz:
          </p>
          <div className="text-sm text-white space-y-1">
            <p>Panel: <a href={result.adminUrl} target="_blank" rel="noopener noreferrer" className="underline">{result.adminUrl}</a></p>
            <p>Login: <span className="font-mono">{result.adminUser}</span></p>
            <p className="flex items-center gap-2">
              Hasło: <code className="rounded bg-black/40 px-2 py-0.5 font-mono">{result.adminPassword}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(result.adminPassword)} className="text-xs text-emerald-200 hover:text-white inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> kopiuj
              </button>
            </p>
          </div>
          <p className="text-[11px] text-neutral-300">{result.note}</p>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-semibold text-white mb-3">Wybierz aplikację</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.catalog.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => setApp(a.slug)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                app === a.slug ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-emerald-300" />
                <span className="font-bold text-white">{a.name}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">{a.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3 max-w-lg">
        <p className="text-sm font-semibold text-white">Dane administratora</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="Login admina" className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
          <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="E-mail admina" type="email" className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
        </div>
        <button
          type="button"
          onClick={install}
          disabled={pending || inflight || !app || !adminEmail.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {inflight ? 'Instalacja w toku…' : 'Zainstaluj'}
        </button>
        <p className="text-[11px] text-neutral-500">
          Instalacja działa tylko na pustym katalogu domeny (chronimy istniejące strony). Utworzymy bazę
          danych i hasło administratora automatycznie.
        </p>
      </div>

      {status.installs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Ostatnie instalacje</p>
          {status.installs.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <span className="text-white">{i.app ?? '—'}</span>
              <span className={`text-xs ${i.status === 'FAILED' ? 'text-rose-300' : i.status === 'COMPLETED' ? 'text-emerald-300' : 'text-amber-300'}`}>
                {STATUS_LABEL[i.status] ?? i.status}
                {i.status === 'FAILED' && i.errorMessage ? ` — ${i.errorMessage}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

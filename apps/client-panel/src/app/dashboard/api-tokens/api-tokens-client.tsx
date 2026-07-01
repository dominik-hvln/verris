'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Plus, Copy, Check, AlertCircle, Trash2, KeyRound, ShieldAlert } from 'lucide-react';
import {
  fetchScopes,
  fetchTokens,
  createTokenAction,
  revokeTokenAction,
  type ApiTokenView,
  type ScopeOption,
} from './actions';

const BASE_HINT = '/api/v1';

export function ApiTokensClient() {
  const [tokens, setTokens] = useState<ApiTokenView[]>([]);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expiry, setExpiry] = useState<string>('0');
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = () => {
    Promise.all([fetchTokens(), fetchScopes()])
      .then(([t, s]) => { setTokens(t); setScopes(s); })
      .catch(() => setErr('Nie udało się pobrać danych.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const toggle = (v: string) =>
    setPicked((p) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const submit = () => {
    setErr(null); setCreated(null); setCopied(false);
    startTransition(async () => {
      const r = await createTokenAction({
        name,
        scopes: Array.from(picked),
        expiresInDays: expiry === '0' ? null : Number.parseInt(expiry, 10),
      });
      if (!r.ok) { setErr(r.error); return; }
      setCreated(r.token);
      setName(''); setPicked(new Set()); setExpiry('0');
      reload();
    });
  };

  const revoke = (id: string) => {
    startTransition(async () => {
      const r = await revokeTokenAction(id);
      if (r.ok) reload(); else setErr(r.error ?? 'Błąd');
    });
  };

  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  }

  return (
    <div className="space-y-6">
      {err ? <p className="flex items-center gap-2 text-sm text-rose-200 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2"><AlertCircle className="h-4 w-4" /> {err}</p> : null}

      {created ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-200 font-semibold"><ShieldAlert className="h-5 w-5" /> Skopiuj token teraz — pokazujemy go tylko raz</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-black/50 border border-white/10 px-3 py-2 text-sm text-emerald-300 font-mono">{created}</code>
            <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Skopiowano' : 'Kopiuj'}</button>
          </div>
          <p className="text-xs text-neutral-400">Użyj go w nagłówku: <code className="text-neutral-300">Authorization: Bearer &lt;token&gt;</code>. Po zamknięciu nie odzyskasz sekretu — utwórz nowy, jeśli go zgubisz.</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-400" /> Nowy token</h2>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Nazwa (do czego służy)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. CI deploy, Terraform" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Uprawnienia (scopes)</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map((s) => (
              <label key={s.value} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${picked.has(s.value) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-white/10 text-neutral-300'}`}>
                <input type="checkbox" checked={picked.has(s.value)} onChange={() => toggle(s.value)} className="mt-0.5 accent-emerald-500" />
                <span><span className="font-mono text-xs text-neutral-400">{s.value}</span><br />{s.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Wygaśnięcie</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white">
              <option value="0" className="bg-neutral-900">Bez wygaśnięcia</option>
              <option value="30" className="bg-neutral-900">30 dni</option>
              <option value="90" className="bg-neutral-900">90 dni</option>
              <option value="365" className="bg-neutral-900">1 rok</option>
            </select>
          </div>
          <button onClick={submit} disabled={pending || name.trim().length < 2 || picked.size === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Utwórz token
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">Twoje tokeny</h2>
        {tokens.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Nie masz jeszcze żadnych tokenów.</p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => {
              const expired = t.expiresAt && new Date(t.expiresAt).getTime() < Date.now();
              const revoked = !!t.revokedAt;
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{t.name}</span>
                      {revoked ? <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">Unieważniony</span>
                        : expired ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">Wygasł</span>
                        : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Aktywny</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      <span className="font-mono">{t.prefix}…</span> · {t.scopes.join(', ')} · {t.lastUsedAt ? `użyty ${new Date(t.lastUsedAt).toLocaleDateString('pl-PL')}` : 'nieużywany'}
                    </div>
                  </div>
                  {!revoked ? (
                    <button onClick={() => revoke(t.id)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" /> Unieważnij
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-sm font-semibold text-white">Jak używać</h3>
        <p className="mt-2 text-sm text-neutral-400">Wszystkie żądania kieruj na <code className="text-neutral-300">{BASE_HINT}</code> z nagłówkiem autoryzacji. Przykład:</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/50 border border-white/10 p-3 text-xs text-emerald-300"><code>{`curl -H "Authorization: Bearer vrs_live_…" \\
  https://api.verris.pl/api/v1/services`}</code></pre>
        <p className="mt-2 text-[11px] text-neutral-500">Dostępne na start (read-only): <code>GET /api/v1/me</code>, <code>/services</code>, <code>/services/:id</code>, <code>/billing/wallet</code>, <code>/invoices</code>. Operacje zapisu i webhooki dodamy wkrótce.</p>
      </section>
    </div>
  );
}

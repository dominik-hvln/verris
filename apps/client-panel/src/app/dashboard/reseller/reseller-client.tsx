'use client';

import { useEffect, useState } from 'react';
import { Loader2, Copy, Check, Users2, Wallet, TrendingUp, Link2, Lock } from 'lucide-react';
import {
  fetchResellerOverview,
  fetchResellerClients,
  type ResellerOverview,
  type ResellerClient as Client,
} from './actions';

const pln = (n: number) => `${n.toFixed(2)} K`;

export function ResellerClient() {
  const [ov, setOv] = useState<ResellerOverview | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [state, setState] = useState<'loading' | 'reseller' | 'not'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchResellerOverview().then((r) => {
      if (r.ok) {
        setOv(r.data);
        setState('reseller');
        fetchResellerClients().then(setClients);
      } else {
        setState('not');
      }
    });
  }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  if (state === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  }

  if (state === 'not' || !ov) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center space-y-3">
        <Lock className="mx-auto h-9 w-9 text-neutral-500" />
        <h2 className="text-lg font-semibold text-white">Konto resellera nie jest aktywne</h2>
        <p className="mx-auto max-w-md text-sm text-neutral-400">
          Program white-label pozwala odsprzedawać hosting pod własną marką z własnym narzutem.
          Aby zostać resellerem, skontaktuj się z nami — włączymy program na Twoim koncie i ustalimy warunki.
        </p>
        <a href="/dashboard/support" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Napisz do nas</a>
      </section>
    );
  }

  const suspended = ov.status === 'SUSPENDED';

  return (
    <div className="space-y-6">
      {suspended ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Twoje konto resellera jest tymczasowo zawieszone. Skontaktuj się z nami w razie pytań.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users2 className="h-4 w-4" />} label="Klienci" value={String(ov.clientsCount)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Twój narzut" value={`+${ov.markupPct}%`} accent />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Przychód detaliczny / mies." value={pln(ov.monthlyRetail)} accent />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Koszt hurtowy / mies." value={pln(ov.monthlyWholesale)} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-400" /> Link zapraszający klientów</h3>
        <p className="text-sm text-neutral-400">Klient, który zarejestruje się z tego linku, zostanie przypisany do Ciebie:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-black/50 border border-white/10 px-3 py-2 text-sm text-emerald-300 font-mono">{ov.inviteLink}</code>
          <button onClick={() => copy(ov.inviteLink)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Skopiowano' : 'Kopiuj'}</button>
        </div>
        {ov.brandName ? <p className="text-xs text-neutral-500">Marka: <span className="text-neutral-300">{ov.brandName}</span></p> : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Twoi klienci</h3>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Nie masz jeszcze klientów. Udostępnij link zapraszający, aby ich pozyskać.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-white">{c.name ?? c.email}</span>
                    <span className="ml-2 text-[11px] text-neutral-500">{c.email}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">Klient od {new Date(c.createdAt).toLocaleDateString('pl-PL')}</span>
                </div>
                {c.services.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {c.services.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                        <span>{s.plan ?? 'Usługa'} · {s.status}</span>
                        <span className="font-mono">
                          <span className="text-neutral-500">{s.wholesale.toFixed(2)} K</span>
                          {' → '}
                          <span className="text-emerald-300">{s.retail.toFixed(2)} K detal</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-1 text-[11px] text-neutral-600">Brak aktywnych usług.</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500">
        Ceny detaliczne liczymy automatycznie jako cena hurtowa × (1 + Twój narzut). Pełne rozliczenia
        między Tobą a klientami oraz białą markę na fakturach dodamy w kolejnym etapie.
      </p>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">{icon} {label}</div>
      <p className={`mt-1.5 text-xl font-bold ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

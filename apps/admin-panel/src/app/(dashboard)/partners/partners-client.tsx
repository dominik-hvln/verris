"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save, Banknote, Check, X } from "lucide-react";
import type { PartnerConfig, AdminPayout } from "./data";
import { updatePartnerConfigAction, processPayoutAction } from "./actions";

export function PartnersClient({ config, payouts }: { config: PartnerConfig; payouts: AdminPayout[] }) {
  return (
    <div className="space-y-8">
      <ConfigForm config={config} />
      <PayoutQueue payouts={payouts} />
    </div>
  );
}

function ConfigForm({ config }: { config: PartnerConfig }) {
  const [c, setC] = useState<PartnerConfig>(config);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const num = (k: keyof PartnerConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, [k]: Number.parseInt(e.target.value, 10) || 0 });

  const save = () => {
    setError(null); setOk(false);
    startTransition(async () => {
      const r = await updatePartnerConfigAction(c);
      if (r.ok) setOk(true); else setError(r.error);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Zasady programu</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} className="accent-emerald-500" />
          Program aktywny
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumField label="Prowizja recurring (%)" value={c.commissionPct} onChange={num("commissionPct")} hint="Procent od każdej płatności poleconego klienta." />
        <NumField label="Karencja prowizji (dni)" value={c.holdDays} onChange={num("holdDays")} hint="Czas do udostępnienia prowizji (ochrona przed zwrotami)." />
        <NumField label="Min. wypłata na konto (K)" value={c.minPayout} onChange={num("minPayout")} hint="Próg dla wypłaty przelewem. Portfel — bez limitu." />
        <NumField label="Bonus: próg poleceń (N)" value={c.freeHostingThreshold} onChange={num("freeHostingThreshold")} hint="Liczba płacących poleceń dla bonusu. 0 = wyłączony." />
        <NumField label="Bonus: kredyt za próg (K)" value={c.freeHostingCredit} onChange={num("freeHostingCredit")} hint="Kwota darmowego hostingu za każdy osiągnięty próg." />
      </div>

      {error ? <p className="flex items-center gap-2 text-sm text-rose-200"><AlertCircle className="h-4 w-4" /> {error}</p> : null}
      {ok ? <p className="flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Zapisano ustawienia programu.</p> : null}

      <button onClick={save} disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz zasady
      </button>
    </section>
  );
}

function NumField({ label, value, onChange, hint }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={onChange} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
      {hint ? <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function PayoutQueue({ payouts }: { payouts: AdminPayout[] }) {
  const [rows, setRows] = useState(payouts);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (id: string, action: "PAID" | "REJECTED") => {
    setError(null); setBusy(id + action);
    startTransition(async () => {
      const r = await processPayoutAction(id, action);
      if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id));
      else setError(r.error);
      setBusy(null);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="mb-1 text-lg font-bold text-white flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-400" /> Wypłaty na konto — do realizacji</h2>
      <p className="mb-4 text-sm text-muted-foreground">Po wykonaniu przelewu kliknij „Oznacz wypłacone". „Odrzuć" zwraca prowizje do puli partnera.</p>

      {error ? <p className="mb-3 flex items-center gap-2 text-sm text-rose-200"><AlertCircle className="h-4 w-4" /> {error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-muted-foreground">Brak oczekujących wypłat.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-white">{Number(p.amount).toFixed(2)} K</p>
                <p className="text-[11px] text-neutral-500">
                  Partner: <span className="font-mono">{p.partnerUserId.slice(0, 8)}</span> · IBAN: <span className="font-mono">{p.bankAccount ?? "—"}</span> · {new Date(p.requestedAt).toLocaleString("pl-PL")}
                </p>
              </div>
              <button onClick={() => act(p.id, "PAID")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {busy === p.id + "PAID" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Oznacz wypłacone
              </button>
              <button onClick={() => act(p.id, "REJECTED")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Odrzuć
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

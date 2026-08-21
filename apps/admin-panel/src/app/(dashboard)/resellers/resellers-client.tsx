"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import type { ResellerRow } from "./data";
import { enableResellerAction, updateResellerAction } from "./actions";

export function ResellersClient({ rows }: { rows: ResellerRow[] }) {
  return (
    <div className="space-y-8">
      <EnableForm />
      <ResellerList rows={rows} />
    </div>
  );
}

function EnableForm() {
  const [userId, setUserId] = useState("");
  const [markup, setMarkup] = useState("20");
  const [brand, setBrand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null); setOk(false);
    startTransition(async () => {
      const r = await enableResellerAction({ userId, markupPct: Number.parseInt(markup, 10) || 0, brandName: brand });
      if (r.ok) { setOk(true); setUserId(""); setBrand(""); } else setError(r.error);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-400" /> Włącz resellera</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="ID użytkownika (UUID)"><input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="np. 1a2b3c4d-…" className="inp" /></Field>
        <Field label="Narzut (%)"><input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} className="inp" /></Field>
        <Field label="Nazwa marki (opcjonalnie)"><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="np. HostPro" className="inp" /></Field>
      </div>
      {error ? <p className="flex items-center gap-2 text-sm text-rose-200"><AlertCircle className="h-4 w-4" /> {error}</p> : null}
      {ok ? <p className="flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Reseller włączony.</p> : null}
      <button onClick={submit} disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Włącz / zapisz
      </button>
      <p className="text-[11px] text-muted-foreground">ID klienta znajdziesz w sekcji „Klienci". Ponowne wywołanie z tym samym ID aktualizuje narzut/markę.</p>
      <style jsx>{`:global(.inp){width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);padding:.5rem .7rem;font-size:.875rem;color:#fff;outline:none}`}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function ResellerList({ rows }: { rows: ResellerRow[] }) {
  const [list, setList] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setMarkup = (userId: string, markupPct: number) => {
    setBusy(userId); setError(null);
    startTransition(async () => {
      const r = await updateResellerAction(userId, { markupPct });
      if (r.ok) setList((l) => l.map((x) => (x.userId === userId ? { ...x, markupPct } : x)));
      else setError(r.error);
      setBusy(null);
    });
  };
  const setStatus = (userId: string, status: "ACTIVE" | "SUSPENDED") => {
    setBusy(userId); setError(null);
    startTransition(async () => {
      const r = await updateResellerAction(userId, { status });
      if (r.ok) setList((l) => l.map((x) => (x.userId === userId ? { ...x, status } : x)));
      else setError(r.error);
      setBusy(null);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="mb-4 text-lg font-bold text-white">Aktywni resellerzy</h2>
      {error ? <p className="mb-3 flex items-center gap-2 text-sm text-rose-200"><AlertCircle className="h-4 w-4" /> {error}</p> : null}
      {list.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-sm text-muted-foreground">Brak resellerów.</div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{r.brandName || <span className="text-neutral-500">(bez marki)</span>} · <span className="font-mono text-xs text-neutral-400">{r.code}</span></p>
                <p className="text-[11px] text-neutral-500">user: <span className="font-mono">{r.userId.slice(0, 8)}</span> · od {new Date(r.createdAt).toLocaleDateString("pl-PL")}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-400">Narzut</span>
                <input type="number" defaultValue={r.markupPct} onBlur={(e) => { const v = Number.parseInt(e.target.value, 10); if (v !== r.markupPct) setMarkup(r.userId, v); }} className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white" />
                <span className="text-xs text-neutral-500">%</span>
              </div>
              {r.status === "ACTIVE" ? (
                <button onClick={() => setStatus(r.userId, "SUSPENDED")} disabled={busy === r.userId} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">Zawieś</button>
              ) : (
                <button onClick={() => setStatus(r.userId, "ACTIVE")} disabled={busy === r.userId} className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50">Aktywuj</button>
              )}
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${r.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : r.status === "SUSPENDED" ? "bg-amber-500/10 text-amber-300 border-amber-500/30" : "bg-neutral-500/10 text-neutral-300 border-neutral-500/30"}`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

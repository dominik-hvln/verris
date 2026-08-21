"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, ArrowRight, AlertTriangle } from "lucide-react";
import { drainNode, fetchMigrationPlan, type MigrationPlan } from "../actions";

interface Props {
  serverId: string;
  acceptsNewAccounts: boolean;
}

export function DrainPanel({ serverId, acceptsNewAccounts }: Props) {
  const [pending, startTransition] = useTransition();
  const [drained, setDrained] = useState(!acceptsNewAccounts);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const doDrain = () => {
    setError(null);
    startTransition(async () => {
      const res = await drainNode(serverId, reason.trim() || undefined);
      if (res.error) setError(res.error);
      else setDrained(true);
    });
  };

  const loadPlan = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetchMigrationPlan(serverId);
      if (res.error) setError(res.error);
      else setPlan(res.data ?? null);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <LogOut className="h-4 w-4 text-rose-300" /> Wycofywanie węzła (drain)
      </div>

      <p className="text-xs text-muted-foreground">
        Drain wyłącza węzeł z rotacji (cordon) — nowe konta nie będą tu trafiać, a istniejące
        działają dalej. <strong className="text-white">Nie przenosi danych</strong>. Plan migracji
        poniżej pokazuje, dokąd przenieść konta — samo przeniesienie wykonujesz świadomie
        (backup→restore), najlepiej po godzinach i z kopią.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[200px] space-y-1">
          <span className="text-xs text-muted-foreground">Powód (audyt, opcjonalnie)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="np. wymiana sprzętu / wycofanie węzła"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <button
          type="button"
          onClick={doDrain}
          disabled={pending || drained}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {drained ? "Węzeł w drain (cordon)" : "Rozpocznij drain"}
        </button>
        <button
          type="button"
          onClick={loadPlan}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
        >
          Pokaż plan migracji
        </button>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {plan ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              Kont: <strong className="text-white">{plan.totalAccounts}</strong>
            </span>
            <span>
              Węzłów docelowych: <strong className="text-white">{plan.targetNodeCount}</strong>
            </span>
            {plan.unplaceable > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> bez miejsca: {plan.unplaceable} (dodaj/odciąż węzeł)
              </span>
            ) : (
              <span className="text-emerald-300">Wszystkie konta mają sugerowany cel.</span>
            )}
          </div>

          {plan.accounts.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-[#050505] px-3 py-6 text-center text-xs text-neutral-500">
              Brak kont na tym węźle.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
              {plan.accounts.map((a) => (
                <div
                  key={a.accountId}
                  className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-white">{a.domain}</p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {a.daUsername} · {a.planName} · {a.footprint.ram} MB RAM / {a.footprint.disk} MB dysk
                    </p>
                  </div>
                  <div className="shrink-0 text-xs">
                    {a.suggestedTarget ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <ArrowRight className="h-3.5 w-3.5" /> {a.suggestedTarget.name}
                      </span>
                    ) : (
                      <span className="text-amber-300">brak miejsca</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-neutral-500">
            To tylko sugestia rozmieszczenia (najmniej obciążony węzeł mieszczący plan). Przeniesienie
            danych wykonaj ręcznie/migratorem z kopią zapasową i repointem DNS.
          </p>
        </div>
      ) : null}
    </div>
  );
}

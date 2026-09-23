"use client";

import { useState, useTransition } from "react";
import { FLAGI_MODULOW } from "@verris/contracts";
import type { FeatureFlagRow } from "./data";
import { createFeatureFlagAction, updateFeatureFlagAction } from "./actions";

/**
 * N-12 — flagi funkcji. Klucze z FLAGI_MODULOW sterują modułami panelu klienta
 * (brak flagi = moduł działa jak dotąd). Wyłączona flaga z rolloutem 0% = moduł ukryty
 * dla wszystkich; rollout N% = ukryty dla (100-N)% klientów, stabilnie per klient.
 */
export function FeatureFlags({ rows }: { rows: FeatureFlagRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const brakujace = Object.entries(FLAGI_MODULOW).filter(([k]) => !rows.some((r) => r.key === k));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? "Zapisano." : r.error ?? "Nie udało się zapisać.");
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Flagi <code>modul.*</code> włączają i wyłączają moduły panelu klienta bez wdrożenia. Pozostałe klucze nic nie
        sterują — kod ich nie czyta.
      </p>
      <ul className="m-0 list-none space-y-2 p-0">
        {rows.map((f) => {
          const znana = f.key in FLAGI_MODULOW;
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <span className="font-mono">{f.key}</span>
              <span className="text-muted-foreground">{f.name}</span>
              {!znana ? <span className="text-xs text-amber-300">nie steruje niczym</span> : null}
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => updateFeatureFlagAction(f.id, { enabledDefault: !f.enabledDefault }))}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold ${f.enabledDefault ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-muted-foreground"}`}
                >
                  {f.enabledDefault ? "włączona dla wszystkich" : "wyłączona"}
                </button>
                {!f.enabledDefault ? (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    rollout
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={f.rolloutPercent}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        if (v !== f.rolloutPercent) run(() => updateFeatureFlagAction(f.id, { rolloutPercent: v }));
                      }}
                      className="w-16 rounded-md border border-white/15 bg-transparent px-2 py-0.5"
                    />
                    %
                  </label>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {brakujace.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {brakujace.map(([k, nazwa]) => (
            <button
              key={k}
              type="button"
              disabled={pending}
              onClick={() => run(() => createFeatureFlagAction(k, nazwa))}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white hover:bg-white/10"
            >
              + flaga: {nazwa}
            </button>
          ))}
        </div>
      ) : null}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

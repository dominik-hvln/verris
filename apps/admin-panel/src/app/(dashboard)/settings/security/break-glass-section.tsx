"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Copy, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import {
  fetchBreakGlassStatus,
  regenerateBreakGlass,
  type BreakGlassStatus,
} from "./actions";

export function BreakGlassSection() {
  const [status, setStatus] = useState<BreakGlassStatus | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    void fetchBreakGlassStatus().then((res) => {
      if ("data" in res && res.data) setStatus(res.data);
    });
  };
  useEffect(load, []);

  const onRegenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCodes(null);
    startTransition(async () => {
      const res = await regenerateBreakGlass(password, code);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("data" in res && res.data) setCodes(res.data.codes);
      setPassword("");
      setCode("");
      load();
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" /> Kody awaryjne (break-glass)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Jednorazowe kody do logowania, gdy stracisz dostęp do passkey. Logowanie awaryjne
          wymaga hasła + kodu 2FA + jednego z tych kodów, a każde użycie powiadamia wszystkich
          administratorów. Trzymaj je offline. Wymaga włączonego 2FA.
        </p>
      </div>

      {status && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-neutral-300">
            Pozostałe kody: <strong className="text-white">{status.remaining}</strong>
          </span>
          {status.generatedAt && (
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-neutral-300">
              Wygenerowano: {new Date(status.generatedAt).toLocaleString("pl-PL")}
            </span>
          )}
          {status.lastUsedAt && (
            <span className="rounded-full border border-amber-500/30 px-2.5 py-0.5 text-amber-200">
              Ostatnio użyto: {new Date(status.lastUsedAt).toLocaleString("pl-PL")}
            </span>
          )}
        </div>
      )}

      {codes && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-100 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Zapisz te kody teraz — pokazujemy je tylko raz.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm text-white">
            {codes.map((c) => (
              <code key={c} className="rounded bg-black/30 px-2 py-1">
                {c}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}
            className="inline-flex items-center gap-1.5 text-xs text-amber-200 hover:text-amber-100"
          >
            <Copy className="h-3 w-3" /> Kopiuj wszystkie
          </button>
        </div>
      )}

      <form onSubmit={onRegenerate} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Wygenerowanie nowego zestawu unieważnia poprzedni. Potwierdź tożsamość:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Hasło</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Kod 2FA (TOTP)</span>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              placeholder="123456"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-amber-500/60"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-black"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {status && status.remaining > 0 ? "Wygeneruj nowe kody" : "Wygeneruj kody"}
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
    </section>
  );
}

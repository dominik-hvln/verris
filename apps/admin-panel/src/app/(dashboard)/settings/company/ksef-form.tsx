"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Check, FileText, Loader2, ShieldCheck } from "lucide-react";
import {
  fetchKsef,
  fetchKsefOverview,
  retryKsefInvoice,
  saveKsef,
  type KsefOverview,
  type KsefSettings,
} from "./actions";

export function KsefForm() {
  const [cfg, setCfg] = useState<KsefSettings | null>(null);
  const [overview, setOverview] = useState<KsefOverview | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [env, setEnv] = useState<"test" | "prod">("test");
  const [nip, setNip] = useState("");
  const [token, setToken] = useState("");
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    void fetchKsef().then((res) => {
      if ("data" in res && res.data) {
        setCfg(res.data);
        setEnabled(res.data.enabled);
        setEnv(res.data.env);
        setNip(res.data.nip);
      } else if ("error" in res && res.error) setError(res.error);
    });
    void fetchKsefOverview().then((res) => {
      if ("data" in res && res.data) setOverview(res.data);
    });
  };
  useEffect(load, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await saveKsef({
        enabled,
        env,
        nip,
        token: token.trim() || undefined,
        publicKeyPem: publicKeyPem.trim() || undefined,
      });
      if ("error" in res && res.error) setError(res.error);
      else {
        if ("data" in res && res.data) setCfg(res.data);
        setToken("");
        setPublicKeyPem("");
        setSavedAt(new Date());
        load();
      }
    });
  };

  const onRetry = (id: string) => {
    startTransition(async () => {
      await retryKsefInvoice(id);
      load();
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-300" /> KSeF — Krajowy System e-Faktur
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Token i klucz publiczny MF są szyfrowane kluczem KMS i nigdy nie są zwracane przez API.
          Zostaw pola puste, aby zachować obecne. Włącz dopiero po pomyślnym smoke na środowisku
          testowym (ksef-test).
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            Wysyłaj faktury do KSeF (włączone = scheduler co 10 min)
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Środowisko</span>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value as "test" | "prod")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            >
              <option value="test">Testowe (ksef-test.mf.gov.pl)</option>
              <option value="prod">Produkcyjne (ksef.mf.gov.pl)</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">NIP podatnika</span>
            <input
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="10 cyfr"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            />
          </label>

          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Token autoryzacyjny KSeF {cfg?.tokenSet && "(ustawiony — zostaw puste, by zachować)"}
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={cfg?.tokenSet ? "•••••••• zapisany" : "wklej token z Aplikacji Podatnika"}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            />
          </label>

          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Klucz publiczny MF (PEM) {cfg?.publicKeySet && "(ustawiony — zostaw puste, by zachować)"}
            </span>
            <textarea
              value={publicKeyPem}
              onChange={(e) => setPublicKeyPem(e.target.value)}
              placeholder={cfg?.publicKeySet ? "•••••••• zapisany" : "-----BEGIN PUBLIC KEY-----\n…"}
              rows={4}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-mono outline-none focus:border-indigo-500/60"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Zapisz konfigurację KSeF
          </button>
          {savedAt && (
            <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Zapisano {savedAt.toLocaleTimeString("pl-PL")}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {overview && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
          <p className="text-sm font-medium text-white">Status faktur w KSeF</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(overview.counts).map(([k, v]) => (
              <span key={k} className="rounded-full border border-white/15 px-2.5 py-0.5 text-neutral-300">
                {k}: <strong className="text-white">{v}</strong>
              </span>
            ))}
            {Object.keys(overview.counts).length === 0 && (
              <span className="text-muted-foreground">Brak faktur w obiegu KSeF.</span>
            )}
          </div>
          {overview.recentRejected.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-rose-300">Odrzucone (wymagają interwencji):</p>
              {overview.recentRejected.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                  <span className="truncate">
                    <code>{r.number}</code> — {r.error ?? "błąd"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRetry(r.id)}
                    disabled={isPending}
                    className="shrink-0 px-2 py-0.5 rounded border border-white/15 hover:bg-white/5 disabled:opacity-50"
                  >
                    Ponów
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

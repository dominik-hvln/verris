"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Percent, Plus } from "lucide-react";
import { createPromoAction } from "./actions";

const PERCENT_PRESETS = ["10", "15", "20", "25", "50"];

export function CreateServicePromoForm() {
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("20");
  const [description, setDescription] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validTo, setValidTo] = useState("");
  const [appliesToRenewals, setAppliesToRenewals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await createPromoAction({
        code,
        kind: "SERVICE_PERCENT_OFF",
        value: percent,
        description: description || undefined,
        maxRedemptions: maxRedemptions ? Number.parseInt(maxRedemptions, 10) : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        appliesToRenewals,
      });
      if (!res.ok) {
        setError(res.error ?? "Nieznany błąd.");
        return;
      }
      setSuccess(`Kod "${res.code}" został utworzony.`);
      setCode("");
      setPercent("20");
      setDescription("");
      setMaxRedemptions("");
      setValidTo("");
      setAppliesToRenewals(false);
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.04] p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-400/10 border border-indigo-400/30 text-indigo-200">
          <Percent className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Rabat % na zakup usługi</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Klient wpisuje kod w kreatorze nowej usługi (płatność z portfela). Możesz rozszerzyć rabat na
            kolejne odnowienia.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Kod</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            maxLength={40}
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2.5 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Rabat (%)
          </span>
          <div className="grid grid-cols-5 gap-1.5 mt-2 mb-2">
            {PERCENT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPercent(preset)}
                className={`rounded-md border px-2 py-1.5 text-xs font-bold ${
                  percent === preset
                    ? "border-indigo-400 bg-indigo-400/10 text-indigo-200"
                    : "border-white/10 text-neutral-300"
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            required
            className="w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={appliesToRenewals}
          onChange={(e) => setAppliesToRenewals(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/20 accent-indigo-500"
        />
        <span className="text-sm text-neutral-300">
          Stosuj rabat także przy kolejnych odnowieniach z portfela (nie tylko pierwsza opłata).
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Opis</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Maks. realizacji
          </span>
          <input
            type="number"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            min={1}
            placeholder="puste = bez limitu"
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Ważny do
          </span>
          <input
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </label>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-400/20 border border-indigo-400/40 px-5 py-2.5 text-sm font-bold text-indigo-100 hover:bg-indigo-400/30 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Utwórz kod rabatu na usługę
      </button>
    </form>
  );
}

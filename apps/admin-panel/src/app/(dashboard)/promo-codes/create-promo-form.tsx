"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, Tag, Gift, Percent } from "lucide-react";
import { createPromoAction } from "./actions";

type Kind = "FIXED_CREDIT" | "SERVICE_PERCENT_OFF";

const CREDIT_PRESETS = ["10", "25", "50", "100", "200"];
const PERCENT_PRESETS = ["5", "10", "15", "20", "25"];

/**
 * Tworzenie kodów promo. Dwa typy z UI:
 *  - FIXED_CREDIT — voucher dodający kredyty na portfel (1 zł = 1 K).
 *  - SERVICE_PERCENT_OFF — rabat % na zakup usługi (pierwsza opłata, opcjonalnie odnowienia).
 * (PERCENT_BONUS — bonus przy doładowaniu — zostaje po stronie API.)
 */
export function CreatePromoForm() {
  const [kind, setKind] = useState<Kind>("FIXED_CREDIT");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("50");
  const [description, setDescription] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validTo, setValidTo] = useState("");
  const [appliesToRenewals, setAppliesToRenewals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isService = kind === "SERVICE_PERCENT_OFF";
  const presets = isService ? PERCENT_PRESETS : CREDIT_PRESETS;

  const pickKind = (k: Kind) => {
    setKind(k);
    setValue(k === "SERVICE_PERCENT_OFF" ? "15" : "50");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await createPromoAction({
        code,
        kind,
        value,
        description: description || undefined,
        maxRedemptions: maxRedemptions ? Number.parseInt(maxRedemptions, 10) : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        appliesToRenewals: isService ? appliesToRenewals : false,
      });
      if (!res.ok) {
        setError(res.error ?? "Nieznany błąd.");
        return;
      }
      setSuccess(`Kod "${res.code}" został utworzony.`);
      setCode("");
      setValue(isService ? "15" : "50");
      setDescription("");
      setMaxRedemptions("");
      setValidTo("");
      setAppliesToRenewals(false);
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-200">
          <Tag className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Utwórz kod promocyjny</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Voucher zasilający portfel kredytami albo rabat procentowy na zakup usługi.
          </p>
        </div>
      </div>

      {/* Wybór typu kodu */}
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => pickKind("FIXED_CREDIT")}
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
            !isService
              ? "border-emerald-400/60 bg-emerald-400/10"
              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <span>
            <span className="block text-sm font-semibold text-white">Voucher — kredyty na portfel</span>
            <span className="block text-[11px] text-neutral-400">Dodaje stałą kwotę K po wpisaniu kodu.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => pickKind("SERVICE_PERCENT_OFF")}
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
            isService
              ? "border-emerald-400/60 bg-emerald-400/10"
              : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <Percent className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <span>
            <span className="block text-sm font-semibold text-white">Rabat na usługę %</span>
            <span className="block text-[11px] text-neutral-400">Zniżka na zakup usługi w kreatorze.</span>
          </span>
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Kod (3–40 znaków A-Z 0-9)
          </span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={isService ? "np. START15" : "np. WELCOME50"}
            required
            maxLength={40}
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2.5 text-white text-sm font-mono focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            {isService ? "Rabat (%)" : "Wartość kredytów (K)"}
          </span>
          <div className="grid grid-cols-5 gap-1.5 mt-2 mb-2">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setValue(preset)}
                className={`rounded-md border px-2 py-1.5 text-xs font-bold transition-all ${
                  value === preset
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30"
                }`}
              >
                {preset}
                {isService ? "%" : ""}
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            className="w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none"
          />
        </label>
      </div>

      {isService ? (
        <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <input
            type="checkbox"
            checked={appliesToRenewals}
            onChange={(e) => setAppliesToRenewals(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          <span className="text-sm text-white">
            Rabat dotyczy też kolejnych odnowień
            <span className="block text-[11px] text-neutral-400">
              Domyślnie: tylko pierwsza opłata. Zaznacz, by % obowiązywał przy każdym odnowieniu z portfela.
            </span>
          </span>
        </label>
      ) : null}

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          Opis (widoczny w historii / na rachunku)
        </span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
          placeholder={isService ? "np. Promocja startowa −15%" : "np. Bonus powitalny — styczeń"}
          className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Maks. liczba realizacji
          </span>
          <input
            type="number"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            min={1}
            placeholder="puste = bez limitu"
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Ważny do (opcjonalnie)
          </span>
          <input
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-400/20 border border-emerald-400/40 px-5 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-400/30 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Utwórz kod
      </button>
    </form>
  );
}

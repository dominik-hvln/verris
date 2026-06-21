'use client';

import { useActionState } from 'react';
import { Loader2, Save, Gift } from 'lucide-react';
import { updateTrialOfferAction, type TrialOfferForm } from './actions';

export function TrialOfferSettingsForm({ initial }: { initial: TrialOfferForm }) {
  const [state, action, pending] = useActionState(updateTrialOfferAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
        <Gift className="h-4 w-4" /> Oferta okresu próbnego
      </legend>
      <p className="text-xs text-neutral-400">
        Steruje tym, co widzi klient na ekranie zamawiania hostingu. Rabaty wpinają się przez
        istniejące <strong>kody rabatowe</strong> — utwórz kod w „Kody promocyjne" i wpisz go poniżej.
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-white">Pokazuj darmowy okres próbny (bez karty)</span>
        <input type="checkbox" name="freeEnabled" defaultChecked={initial.freeEnabled} className="h-4 w-4 accent-emerald-500" />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-sm text-white">Pokazuj ścieżkę z kartą + rabat na 1. rok</span>
        <input type="checkbox" name="cardEnabled" defaultChecked={initial.cardEnabled} className="h-4 w-4 accent-emerald-500" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField name="annualDiscountPct" label="Rabat % — rok z góry" defaultValue={initial.annualDiscountPct} hint="0–90. Wyświetlany na kaflu Rok z góry." />
        <NumberField name="monthlyDiscountPct" label="Rabat % — miesięcznie (1. rok)" defaultValue={initial.monthlyDiscountPct} hint="0–90. Zwykle mniejszy niż roczny." />
        <NumberField name="introDiscountPeriods" label="Rabat startowy — liczba okresów" defaultValue={initial.introDiscountPeriods} hint="1 = tylko pierwsza opłata. Np. 3 = pierwsze 3 okresy z rabatem, potem pełna cena." />
        <TextField name="annualPromoCode" label="Kod promo — ścieżka roczna (opcjonalny)" defaultValue={initial.annualPromoCode} hint="Pozostawione dla zgodności; rabat startowy liczy się z procentów powyżej." />
        <TextField name="monthlyPromoCode" label="Kod promo — ścieżka miesięczna (opcjonalny)" defaultValue={initial.monthlyPromoCode} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz ofertę trialu
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
        {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
      </div>
    </form>
  );
}

function NumberField({ name, label, defaultValue, hint }: { name: string; label: string; defaultValue: number; hint?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      <input
        type="number"
        name={name}
        min={0}
        max={90}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
      />
      {hint ? <span className="block text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function TextField({ name, label, defaultValue, hint }: { name: string; label: string; defaultValue: string; hint?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-neutral-300">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder="np. START15"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-emerald-400/60"
      />
      {hint ? <span className="block text-[11px] text-neutral-500">{hint}</span> : null}
    </label>
  );
}

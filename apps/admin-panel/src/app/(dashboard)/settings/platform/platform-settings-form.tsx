'use client';

import { useActionState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { updatePlatformSettingsAction, type PlatformSettingsForm } from './actions';

export function PlatformSettingsForm({ initial }: { initial: PlatformSettingsForm }) {
  const [state, action, pending] = useActionState(updatePlatformSettingsAction, {});

  return (
    <form action={action} className="space-y-8 max-w-2xl">
      <fieldset className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
        <legend className="text-sm font-bold text-emerald-400 uppercase tracking-widest px-1">
          Program EKO
        </legend>
        <NumberField
          name="ecoPointsPerTree"
          label="Punkty na 1 drzewo"
          defaultValue={initial.ecoPointsPerTree}
          hint="Domyślnie 1000 — klient widzi postęp w panelu."
        />
        <NumberField
          name="ecoBadgeImpressionsPerPoint"
          label="Wyświetleń badge = 1 punkt EKO"
          defaultValue={initial.ecoBadgeImpressionsPerPoint}
        />
        <NumberField
          name="ecoPointsPer10Credits"
          label="Punkty EKO za 10 K portfela"
          defaultValue={initial.ecoPointsPer10Credits}
          hint="Przy wymianie: np. 100 pkt → 10 K."
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
        <legend className="text-sm font-bold text-sky-400 uppercase tracking-widest px-1">
          Sesje bez aktywności (minuty)
        </legend>
        <NumberField
          name="clientIdleSessionMinutes"
          label="Panel klienta"
          defaultValue={initial.clientIdleSessionMinutes}
        />
        <NumberField
          name="staffIdleSessionMinutes"
          label="Panel staff"
          defaultValue={initial.staffIdleSessionMinutes}
        />
        <NumberField
          name="adminIdleSessionMinutes"
          label="Panel admin"
          defaultValue={initial.adminIdleSessionMinutes}
        />
      </fieldset>

      {state.error ? (
        <p className="text-sm text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-2">
          Zapisano ustawienia platformy.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Zapisz
      </button>
    </form>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={1}
        required
        className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-white focus:border-emerald-500/40 focus:outline-none"
      />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
